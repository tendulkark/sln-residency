import { nightsBetween } from "#src/lib/billing.js";

// Local-calendar-date helpers — mirrors dashboard.routes.js's localDateLabel
// convention (never toISOString(), which shifts a date back a day in IST).
export function startOfDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDayExclusive(dateStr) {
  const d = startOfDay(dateStr);
  d.setDate(d.getDate() + 1);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function localDateLabel(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

// Shared by every "Rooms Reports > Bookings" query (the summary pass, the
// paginated detail pass, and the CSV export) so a filter can never drift
// between them.
function bookingReportWhere(tenantId, { from, to, statusCode, search, checkoutBasis }) {
  const fromDate = from ? startOfDay(from) : null;
  const toDate = to ? endOfDayExclusive(to) : null;

  const dateFilter = checkoutBasis
    ? { status: { code: "checked_out" }, actualCheckOut: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: toDate } : {}) } }
    : { checkIn: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: toDate } : {}) } };

  return {
    tenantId,
    ...dateFilter,
    ...(statusCode ? { status: { code: statusCode } } : {}),
    ...(search
      ? {
          OR: [
            { guest: { name: { contains: search, mode: "insensitive" } } },
            { guest: { phone: { contains: search, mode: "insensitive" } } },
            { room: { roomNumber: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

// The "Bookings by Status" / "Bookings by Room Type" stat cards need an
// accurate count across the *entire* filtered range, not just whatever page
// is currently on screen — but they only need a handful of small fields to
// get it, so this is deliberately a much lighter query than
// buildBookingReportRows: no guest/charges/payments/invoice/audit-trail
// joins, which is where that function's real cost lives on a busy tenant.
export async function summarizeBookingsInRange(prisma, tenantId, filters) {
  const bookings = await prisma.booking.findMany({
    where: bookingReportWhere(tenantId, filters),
    select: {
      id: true,
      groupCode: true,
      status: { select: { code: true, label: true, color: true } },
      room: { select: { roomType: { select: { name: true } } } },
    },
  });

  const groupKeys = new Set(bookings.map((b) => b.groupCode ?? b.id));
  const byStatus = new Map();
  const byRoomType = new Map();

  for (const b of bookings) {
    const statusKey = b.status.code;
    if (!byStatus.has(statusKey)) byStatus.set(statusKey, { code: b.status.code, label: b.status.label, color: b.status.color, count: 0 });
    byStatus.get(statusKey).count += 1;

    const roomTypeName = b.room.roomType.name;
    if (!byRoomType.has(roomTypeName)) byRoomType.set(roomTypeName, { name: roomTypeName, count: 0 });
    byRoomType.get(roomTypeName).count += 1;
  }

  const total = bookings.length;
  const withPercent = (map) => [...map.values()].map((v) => ({ ...v, percent: total ? Math.round((v.count / total) * 100) : 0 }));

  return {
    counts: { bookings: groupKeys.size, totalRooms: total, cancelled: bookings.filter((b) => b.status.code === "cancelled").length },
    byStatus: withPercent(byStatus),
    byRoomType: withPercent(byRoomType),
  };
}

// Columns the Bookings report table can be sorted by. The client's sortBy
// is validated against this list (reports.routes.js) before it ever
// reaches a query — never trust it raw.
export const BOOKINGS_REPORT_SORT_KEYS = [
  "invoiceNumber",
  "guest",
  "room",
  "checkIn",
  "checkOut",
  "actualCheckIn",
  "actualCheckOut",
  "taxableValue",
  "discount",
  "total",
];

// These map straight onto a Booking column or a to-one relation's column,
// so the DB can sort *and* paginate in one query — the fast path the
// pagination audit put in place stays intact for them.
const DIRECT_SORT_ORDER_BY = {
  guest: (dir) => ({ guest: { name: dir } }),
  room: (dir) => ({ room: { roomNumber: dir } }),
  checkIn: (dir) => ({ checkIn: dir }),
  checkOut: (dir) => ({ checkOut: dir }),
  actualCheckIn: (dir) => ({ actualCheckIn: dir }),
  actualCheckOut: (dir) => ({ actualCheckOut: dir }),
};

// invoiceNumber/taxableValue/discount/total are never stored on Booking —
// invoiceNumber lives on a joined Invoice row (and only the active one
// counts), the rest are computed below from BookingCharge/Payment rows.
// There's no Prisma orderBy that reaches them, so sorting by one of these
// necessarily fetches every booking matching the filter (not just one
// page), enriches all of them, sorts in JS, then slices the page out of
// that — heavier than the direct-field path, but only paid when a caller
// actually asks for one of these sorts.
const COMPUTED_SORT_KEYS = new Set(["invoiceNumber", "taxableValue", "discount", "total"]);

function compareForSort(a, b, dir) {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // rows with no value for this column always sort last
  if (b == null) return -1;
  if (typeof a === "string" || typeof b === "string") {
    return dir === "desc" ? String(b).localeCompare(String(a)) : String(a).localeCompare(String(b));
  }
  return dir === "desc" ? b - a : a - b;
}

// The "Rooms Reports > Bookings" row set, enriched with charges/payments/
// invoice/audit-trail data so the table and its CSV export build from one
// place and can never drift from each other. Pass `{ skip, take }` to fetch
// just one page of bookings — the enrichment queries below key off
// `bookingIds`, so a paginated call only ever joins charges/payments/
// invoices/audit logs for the rows actually being displayed, not the whole
// filtered range (the CSV export calls this with no pagination, since a
// full-range export is the point).
//
// Tax figures (taxableValue/cgst/sgst) only ever come from a generated
// Invoice row and only ever appear for a Checked-out booking — GST is
// finalized at checkout (AI_RULES.md #4), so a Confirmed/Checked-in/
// Cancelled row has no real tax figure yet and reports null instead of
// guessing one.
export async function buildBookingReportRows(prisma, tenantId, filters, { skip, take, sortBy, sortDir } = {}) {
  const dir = sortDir === "desc" ? "desc" : "asc";
  const isComputedSort = COMPUTED_SORT_KEYS.has(sortBy);
  const directOrderBy = !isComputedSort && DIRECT_SORT_ORDER_BY[sortBy]?.(dir);

  const bookings = await prisma.booking.findMany({
    where: bookingReportWhere(tenantId, filters),
    include: {
      room: { select: { roomNumber: true, roomType: { select: { name: true } } } },
      guest: true,
      status: true,
      createdBy: { select: { name: true } },
    },
    // A secondary id tiebreak keeps pagination stable when several bookings
    // share the same checkIn instant (e.g. a group booking created at once).
    // A computed-field sort ignores this order entirely (re-sorted in JS
    // below once every row is enriched) and, since it needs every matching
    // row anyway, skips skip/take here too.
    orderBy: [directOrderBy || { checkIn: "asc" }, { id: "asc" }],
    ...(!isComputedSort && skip != null ? { skip } : {}),
    ...(!isComputedSort && take != null ? { take } : {}),
  });

  const bookingIds = bookings.map((b) => b.id);
  if (bookingIds.length === 0) return [];

  const [charges, payments, invoices, statusLogs] = await Promise.all([
    prisma.bookingCharge.findMany({ where: { bookingId: { in: bookingIds } } }),
    prisma.payment.findMany({ where: { bookingId: { in: bookingIds } }, include: { method: true, status: true } }),
    // Only a finalized, active invoice counts toward a booking's reported
    // tax figures/invoice number — a cancelled one was replaced and
    // shouldn't double up (or stand in for) what the reissued invoice
    // already reports, and a merely-reserved (pre-checkout) number isn't a
    // real tax document yet, so this audit-facing report shouldn't imply
    // one was issued.
    prisma.invoice.findMany({ where: { bookingId: { in: bookingIds }, isCancelled: false, isFinalized: true } }),
    prisma.auditLog.findMany({
      where: { tenantId, entityType: "Booking", entityId: { in: bookingIds }, action: "booking.status_change" },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const chargesByBooking = new Map();
  for (const c of charges) {
    if (!chargesByBooking.has(c.bookingId)) chargesByBooking.set(c.bookingId, []);
    chargesByBooking.get(c.bookingId).push(c);
  }
  const paymentsByBooking = new Map();
  for (const p of payments) {
    if (!paymentsByBooking.has(p.bookingId)) paymentsByBooking.set(p.bookingId, []);
    paymentsByBooking.get(p.bookingId).push(p);
  }
  const invoiceByBooking = new Map(invoices.map((i) => [i.bookingId, i]));

  // Latest status-change event per (booking, target status code) — powers
  // "Checked In By" / "Checked Out By" / "Cancelled By" without a schema
  // change, from the audit trail every status transition already writes.
  const eventsByBooking = new Map();
  for (const log of statusLogs) {
    const code = log.metadata?.statusCode;
    if (!code || !log.user) continue;
    if (!eventsByBooking.has(log.entityId)) eventsByBooking.set(log.entityId, {});
    eventsByBooking.get(log.entityId)[code] = log.user.name;
  }

  const rows = bookings.map((b) => {
    const bCharges = chargesByBooking.get(b.id) ?? [];
    const bPayments = paymentsByBooking.get(b.id) ?? [];
    const invoice = invoiceByBooking.get(b.id);
    const events = eventsByBooking.get(b.id) ?? {};

    const chargesTotal = round2(bCharges.filter((c) => c.type === "charge").reduce((s, c) => s + Number(c.amount), 0));
    const discountTotal = round2(bCharges.filter((c) => c.type === "discount").reduce((s, c) => s + Number(c.amount), 0));
    const countedPayments = bPayments.filter((p) => !["failed", "refunded"].includes(p.status.code));
    const refunded = round2(countedPayments.filter((p) => p.type === "refund").reduce((s, p) => s + Number(p.amount), 0));
    // Net of refunds — what the guest actually left with the hotel.
    const advance = round2(countedPayments.filter((p) => p.type !== "refund").reduce((s, p) => s + Number(p.amount), 0) - refunded);

    const isCheckedOut = b.status.code === "checked_out";
    const isCancelled = b.status.code === "cancelled";

    let taxableValue = null;
    let cgst = null;
    let sgst = null;
    let grandTotal = null; // rooms taxable + cgst + sgst (post-discount, pre-other-charges)
    let total = null; // grandTotal + other charges — the final settled amount

    if (isCheckedOut && invoice) {
      taxableValue = Number(invoice.subtotal);
      const halfTax = round2(Number(invoice.taxAmount) / 2);
      cgst = halfTax;
      sgst = round2(Number(invoice.taxAmount) - halfTax);
      grandTotal = round2(taxableValue + Number(invoice.taxAmount));
      total = Number(invoice.total);
    }

    const paymentMethods = [...new Set(bPayments.map((p) => p.method.name))];
    const settlementNote = isCheckedOut
      ? `Checkout settled via ${paymentMethods.join(", ") || "—"}.${
          invoice ? ` GST Applied: ${Number(invoice.taxAmount).toFixed(2)}.` : ""
        } Other/Damages: ${chargesTotal}. Discount: ${discountTotal}.`
      : null;

    return {
      id: b.id,
      groupCode: b.groupCode,
      invoiceNumber: invoice?.invoiceNumber ?? null,
      guest: { name: b.guest.name, phone: b.guest.phone, gstin: b.guest.gstin ?? null },
      room: b.room.roomNumber,
      roomType: b.room.roomType.name,
      bookedBy: b.createdBy?.name ?? null,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: nightsBetween(b.checkIn, b.checkOut),
      actualCheckIn: b.actualCheckIn,
      checkedInBy: events.checked_in ?? null,
      actualCheckOut: b.actualCheckOut,
      checkedOutBy: events.checked_out ?? null,
      taxableValue,
      cgst,
      sgst,
      discount: discountTotal || null,
      grandTotal,
      otherCharges: chargesTotal || null,
      retained: isCancelled ? advance || null : null,
      refunded: refunded || null,
      advance: advance || null,
      total,
      status: { code: b.status.code, label: b.status.label, color: b.status.color },
      cancelledBy: isCancelled ? (events.cancelled ?? null) : null,
      notes: [b.notes, settlementNote].filter(Boolean).join("\n") || null,
    };
  });

  if (isComputedSort) {
    rows.sort((a, b) => compareForSort(a[sortBy], b[sortBy], dir));
    if (skip != null || take != null) {
      const start = skip ?? 0;
      return rows.slice(start, take != null ? start + take : undefined);
    }
  }

  return rows;
}

const CSV_COLUMNS = [
  ["SL", (r, i) => i + 1],
  ["Invoice No", (r) => r.invoiceNumber ?? ""],
  ["Guest", (r) => r.guest.name],
  ["Room", (r) => r.room],
  ["Type", (r) => r.roomType],
  ["Booked By", (r) => r.bookedBy ?? ""],
  ["Check-in", (r) => localDateLabel(r.checkIn)],
  ["Check-out", (r) => localDateLabel(r.checkOut)],
  ["Nights", (r) => r.nights],
  ["Actual In", (r) => (r.actualCheckIn ? new Date(r.actualCheckIn).toISOString() : "")],
  ["Checked In By", (r) => r.checkedInBy ?? ""],
  ["Actual Out", (r) => (r.actualCheckOut ? new Date(r.actualCheckOut).toISOString() : "")],
  ["Checked Out By", (r) => r.checkedOutBy ?? ""],
  ["GSTIN", (r) => r.guest.gstin ?? ""],
  ["Taxable Value", (r) => r.taxableValue ?? ""],
  ["CGST", (r) => r.cgst ?? ""],
  ["SGST", (r) => r.sgst ?? ""],
  ["Discount", (r) => r.discount ?? ""],
  ["Grand Total", (r) => r.grandTotal ?? ""],
  ["Other Charges", (r) => r.otherCharges ?? ""],
  ["Retained", (r) => r.retained ?? ""],
  ["Refunded", (r) => r.refunded ?? ""],
  ["Advance", (r) => r.advance ?? ""],
  ["Total", (r) => r.total ?? ""],
  ["Status", (r) => r.status.label],
  ["Cancelled By", (r) => r.cancelledBy ?? ""],
  ["Notes", (r) => r.notes ?? ""],
];

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows) {
  const header = CSV_COLUMNS.map(([label]) => csvEscape(label)).join(",");
  const lines = rows.map((r, i) => CSV_COLUMNS.map(([, get]) => csvEscape(get(r, i))).join(","));
  return [header, ...lines].join("\n");
}
