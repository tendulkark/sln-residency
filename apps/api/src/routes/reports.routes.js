import { requirePermission } from "#src/lib/permissions.js";
import {
  startOfDay,
  endOfDayExclusive,
  localDateLabel,
  localDateTimeLabel,
  round2,
  previousRange,
  eachDayLabel,
  taxLinesOf,
  buildBookingReportRows,
  summarizeBookingsInRange,
  rowsToCsv,
  toCsv,
  BOOKINGS_REPORT_SORT_KEYS,
} from "#src/lib/reports.js";
import { buildOccupancyReport } from "#src/lib/occupancy.js";

function parsePage(query) {
  return {
    page: Math.max(1, Number(query.page) || 1),
    pageSize: Math.min(200, Math.max(1, Number(query.pageSize) || 50)),
  };
}

function parseBookingsQuery(query) {
  return {
    from: query.from,
    to: query.to,
    statusCode: query.status || undefined,
    search: query.search || undefined,
    checkoutBasis: query.checkoutBasis === "true",
  };
}

// Never trust a raw client sortBy as a Prisma field/relation path — only a
// value from the known column list is allowed through.
function parseSort(query, allowedKeys) {
  return {
    sortBy: allowedKeys.includes(query.sortBy) ? query.sortBy : undefined,
    sortDir: query.sortDir === "desc" ? "desc" : query.sortDir === "asc" ? "asc" : undefined,
  };
}

// Every report takes the same from/to (inclusive calendar dates). A range
// that's missing or backwards is refused rather than silently read as
// "everything" or "nothing".
function parseRange(query, reply) {
  const { from, to } = query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? "") || from > to) {
    reply.code(400).send({ error: "from and to must be dates (YYYY-MM-DD), with from on or before to" });
    return null;
  }
  return { fromDate: startOfDay(from), toDate: endOfDayExclusive(to) };
}

function sendCsv(reply, filename, csv) {
  reply.header("Content-Type", "text/csv; charset=utf-8");
  reply.header("Content-Disposition", `attachment; filename="${filename}"`);
  return reply.send(csv);
}

// "failed"/"refunded" payment statuses mark money that never really landed
// (or was reversed wholesale), so they count for neither side — the same
// rule billing.js applies to a stay's balance.
const COUNTED_PAYMENT = { status: { code: { notIn: ["failed", "refunded"] } } };

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

function paymentsIn(prisma, tenantId, fromDate, toDate) {
  return prisma.payment.findMany({
    where: { tenantId, recordedAt: { gte: fromDate, lt: toDate }, ...COUNTED_PAYMENT },
    include: {
      method: { select: { name: true } },
      recordedBy: { select: { id: true, name: true } },
      booking: { select: { guest: { select: { name: true } }, room: { select: { roomNumber: true } } } },
    },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
  });
}

// Finalized, still-active invoices issued in the range — "billed" revenue,
// which differs from cash collected by advances taken before the stay and
// dues settled after it.
async function billedIn(prisma, tenantId, fromDate, toDate) {
  const agg = await prisma.invoice.aggregate({
    where: { tenantId, isCancelled: false, isFinalized: true, generatedAt: { gte: fromDate, lt: toDate } },
    _sum: { total: true },
    _count: true,
  });
  return { amount: round2(Number(agg._sum.total ?? 0)), invoices: agg._count };
}

function summarizePayments(payments) {
  let received = 0;
  let refunded = 0;
  for (const p of payments) {
    if (p.type === "refund") refunded += Number(p.amount);
    else received += Number(p.amount);
  }
  return { received: round2(received), refunded: round2(refunded), net: round2(received - refunded) };
}

// A running net/received/refunded tally, optionally split by payment method.
function newTally() {
  return { received: 0, refunded: 0, net: 0, count: 0, byMethod: {} };
}
function addToTally(tally, p) {
  const amount = Number(p.amount);
  const signed = p.type === "refund" ? -amount : amount;
  if (p.type === "refund") tally.refunded += amount;
  else tally.received += amount;
  tally.net += signed;
  tally.count += 1;
  tally.byMethod[p.method.name] = (tally.byMethod[p.method.name] ?? 0) + signed;
}
function roundTally({ received, refunded, net, count, byMethod }) {
  return {
    received: round2(received),
    refunded: round2(refunded),
    net: round2(net),
    count,
    byMethod: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, round2(v)])),
  };
}

// ---------------------------------------------------------------------------
// GST
// ---------------------------------------------------------------------------

// B2B when the invoice was issued to a GSTIN (as frozen on the invoice, or
// the live guest row for an invoice from before guest snapshots existed) —
// the split GSTR-1 files under: B2B invoice by invoice, B2C summed by rate.
function gstinOf(inv) {
  return (inv.guestSnapshot?.gstin ?? inv.booking?.guest?.gstin ?? "").trim() || null;
}

const GST_SELECT = {
  id: true,
  bookingId: true,
  invoiceNumber: true,
  generatedAt: true,
  subtotal: true,
  taxAmount: true,
  taxRateSnapshot: true,
  total: true,
  snapshot: true,
  guestSnapshot: true,
  taxRule: { select: { hsnSacCode: true } },
  booking: { select: { guest: { select: { name: true, companyName: true, gstin: true } }, room: { select: { roomNumber: true } } } },
};

function gstInvoiceRow(inv) {
  const lines = taxLinesOf(inv);
  const gstin = gstinOf(inv);
  const guest = inv.guestSnapshot ?? inv.booking.guest;
  return {
    id: inv.id,
    bookingId: inv.bookingId,
    invoiceNumber: inv.invoiceNumber,
    date: inv.generatedAt,
    guestName: guest.name,
    companyName: guest.companyName ?? null,
    gstin,
    type: gstin ? "b2b" : "b2c",
    room: inv.booking.room.roomNumber,
    sacCode: inv.taxRule?.hsnSacCode ?? null,
    lines,
    rates: [...new Set(lines.map((l) => l.ratePercent))],
    taxable: round2(lines.reduce((s, l) => s + l.taxable, 0)),
    cgst: round2(lines.reduce((s, l) => s + l.cgst, 0)),
    sgst: round2(lines.reduce((s, l) => s + l.sgst, 0)),
    total: Number(inv.total),
  };
}

function newGstTotals() {
  return { invoices: 0, taxable: 0, cgst: 0, sgst: 0, total: 0 };
}
function roundGstTotals(t) {
  return { ...t, taxable: round2(t.taxable), cgst: round2(t.cgst), sgst: round2(t.sgst), tax: round2(t.cgst + t.sgst), total: round2(t.total) };
}

export default async function reportsRoutes(fastify) {
  const guard = { preHandler: [fastify.authenticate, requirePermission("reports.view")] };

  fastify.get("/reports/bookings", guard, async (request, reply) => {
    if (!parseRange(request.query, reply)) return reply;
    const tenantId = request.user.tenantId;
    const filters = parseBookingsQuery(request.query);
    const { page, pageSize } = parsePage(request.query);
    const { sortBy, sortDir } = parseSort(request.query, BOOKINGS_REPORT_SORT_KEYS);

    // Two passes on purpose: the summary (counts, charts, the totals row)
    // needs every matching booking but only lean fields and aggregates;
    // the expensive per-row enrichment in buildBookingReportRows only runs
    // for this one page's rows — unless sortBy is one of the computed
    // columns, which reports.js documents and handles.
    const [summary, rows] = await Promise.all([
      summarizeBookingsInRange(fastify.prisma, tenantId, filters),
      buildBookingReportRows(fastify.prisma, tenantId, filters, { skip: (page - 1) * pageSize, take: pageSize, sortBy, sortDir }),
    ]);

    return { ...summary, rows, total: summary.counts.totalRooms, page, pageSize };
  });

  fastify.get("/reports/bookings.csv", guard, async (request, reply) => {
    if (!parseRange(request.query, reply)) return reply;
    const rows = await buildBookingReportRows(fastify.prisma, request.user.tenantId, parseBookingsQuery(request.query));
    return sendCsv(reply, "room-bookings-report.csv", rowsToCsv(rows));
  });

  fastify.get("/reports/revenue", guard, async (request, reply) => {
    const range = parseRange(request.query, reply);
    if (!range) return reply;
    const tenantId = request.user.tenantId;
    const prev = previousRange(request.query.from, request.query.to);

    const [payments, previousPayments, billed, previousBilled] = await Promise.all([
      paymentsIn(fastify.prisma, tenantId, range.fromDate, range.toDate),
      fastify.prisma.payment.findMany({
        where: { tenantId, recordedAt: { gte: prev.fromDate, lt: prev.toDate }, ...COUNTED_PAYMENT },
        select: { amount: true, type: true },
      }),
      billedIn(fastify.prisma, tenantId, range.fromDate, range.toDate),
      billedIn(fastify.prisma, tenantId, prev.fromDate, prev.toDate),
    ]);

    // Net collections: a refund (a cancelled stay's advance, an overpayment
    // handed back) comes off the day, method and staff member it was paid
    // out by, and is also reported on its own.
    const byDay = new Map(eachDayLabel(range.fromDate, range.toDate).map((d) => [d, newTally()]));
    const byMethod = new Map();
    const byStaff = new Map();
    for (const p of payments) {
      addToTally(byDay.get(localDateLabel(p.recordedAt)), p);
      if (!byMethod.has(p.method.name)) byMethod.set(p.method.name, newTally());
      addToTally(byMethod.get(p.method.name), p);
      if (!byStaff.has(p.recordedBy.id)) byStaff.set(p.recordedBy.id, { name: p.recordedBy.name, tally: newTally() });
      addToTally(byStaff.get(p.recordedBy.id).tally, p);
    }

    return {
      ...summarizePayments(payments),
      billed,
      previous: { ...summarizePayments(previousPayments), billed: previousBilled, from: localDateLabel(prev.fromDate) },
      byMethod: [...byMethod.entries()]
        .map(([name, t]) => {
          const { byMethod: _self, ...rest } = roundTally(t);
          return { name, ...rest };
        })
        .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name)),
      byStaff: [...byStaff.values()]
        .map(({ name, tally }) => ({ name, ...roundTally(tally) }))
        .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name)),
      daily: [...byDay.entries()].map(([date, t]) => ({ date, ...roundTally(t) })),
    };
  });

  // Payment by payment — what the desk reconciles the cash drawer and the
  // bank statement against.
  fastify.get("/reports/revenue.csv", guard, async (request, reply) => {
    const range = parseRange(request.query, reply);
    if (!range) return reply;
    const payments = await paymentsIn(fastify.prisma, request.user.tenantId, range.fromDate, range.toDate);
    const csv = toCsv(
      [
        ["Date", (p) => localDateLabel(p.recordedAt)],
        ["Time", (p) => localDateTimeLabel(p.recordedAt).slice(11)],
        ["Guest", (p) => p.booking.guest.name],
        ["Room", (p) => p.booking.room.roomNumber],
        ["Method", (p) => p.method.name],
        ["Type", (p) => (p.type === "refund" ? "Refund" : "Payment")],
        ["Amount", (p) => (p.type === "refund" ? -Number(p.amount) : Number(p.amount))],
        ["Reference", (p) => p.referenceNote ?? ""],
        ["Recorded By", (p) => p.recordedBy.name],
      ],
      payments
    );
    return sendCsv(reply, "revenue-report.csv", csv);
  });

  fastify.get("/reports/occupancy", guard, async (request, reply) => {
    const range = parseRange(request.query, reply);
    if (!range) return reply;
    return buildOccupancyReport(fastify.prisma, request.user.tenantId, range.fromDate, range.toDate);
  });

  fastify.get("/reports/gst", guard, async (request, reply) => {
    const range = parseRange(request.query, reply);
    if (!range) return reply;
    const tenantId = request.user.tenantId;
    const { page, pageSize } = parsePage(request.query);
    const type = ["b2b", "b2c"].includes(request.query.type) ? request.query.type : null;

    // Cancelled invoices never collected GST that's still owed — a
    // cancel+reissue's replacement carries the real figures. A merely
    // reserved (pre-checkout) invoice hasn't collected anything yet, so
    // it's excluded until it's finalized.
    const period = { tenantId, isFinalized: true, generatedAt: { gte: range.fromDate, lt: range.toDate } };
    const [invoices, cancelledCount] = await Promise.all([
      fastify.prisma.invoice.findMany({ where: { ...period, isCancelled: false }, select: GST_SELECT, orderBy: [{ generatedAt: "asc" }, { id: "asc" }] }),
      fastify.prisma.invoice.count({ where: { ...period, isCancelled: true } }),
    ]);

    const rows = invoices.map(gstInvoiceRow);
    const overall = newGstTotals();
    const split = { b2b: newGstTotals(), b2c: newGstTotals() };
    const byRate = new Map();
    for (const r of rows) {
      for (const t of [overall, split[r.type]]) {
        t.invoices += 1;
        t.taxable += r.taxable;
        t.cgst += r.cgst;
        t.sgst += r.sgst;
        t.total += r.total;
      }
      for (const l of r.lines) {
        if (!byRate.has(l.ratePercent)) byRate.set(l.ratePercent, { ratePercent: l.ratePercent, invoiceIds: new Set(), taxable: 0, cgst: 0, sgst: 0 });
        const agg = byRate.get(l.ratePercent);
        agg.invoiceIds.add(r.id); // an invoice with several charges at one rate is still one invoice
        agg.taxable += l.taxable;
        agg.cgst += l.cgst;
        agg.sgst += l.sgst;
      }
    }

    const filtered = type ? rows.filter((r) => r.type === type) : rows;
    return {
      totals: roundGstTotals(overall),
      b2b: roundGstTotals(split.b2b),
      b2c: roundGstTotals(split.b2c),
      cancelledCount,
      byRate: [...byRate.values()]
        .sort((a, b) => a.ratePercent - b.ratePercent)
        .map(({ invoiceIds, ...r }) => ({
          ...r,
          invoices: invoiceIds.size,
          taxable: round2(r.taxable),
          cgst: round2(r.cgst),
          sgst: round2(r.sgst),
          tax: round2(r.cgst + r.sgst),
        })),
      rows: filtered.slice((page - 1) * pageSize, page * pageSize).map(({ lines, ...r }) => r),
      total: filtered.length,
      page,
      pageSize,
    };
  });

  // GSTR-1-friendly: one line per invoice per tax rate (how the B2B section
  // is filed), with GSTIN, SAC and B2B/B2C on every line so the accountant
  // can filter/pivot it either way.
  fastify.get("/reports/gst.csv", guard, async (request, reply) => {
    const range = parseRange(request.query, reply);
    if (!range) return reply;
    const type = ["b2b", "b2c"].includes(request.query.type) ? request.query.type : null;
    const invoices = await fastify.prisma.invoice.findMany({
      where: { tenantId: request.user.tenantId, isFinalized: true, isCancelled: false, generatedAt: { gte: range.fromDate, lt: range.toDate } },
      select: GST_SELECT,
      orderBy: [{ generatedAt: "asc" }, { id: "asc" }],
    });
    const lines = invoices
      .map(gstInvoiceRow)
      .filter((r) => !type || r.type === type)
      .flatMap((r) => r.lines.map((l) => ({ ...r, line: l })));

    const csv = toCsv(
      [
        ["Type", (x) => x.type.toUpperCase()],
        ["Invoice No", (x) => x.invoiceNumber],
        ["Invoice Date", (x) => localDateLabel(x.date)],
        ["Recipient", (x) => x.companyName || x.guestName],
        ["GSTIN", (x) => x.gstin ?? ""],
        ["SAC", (x) => x.sacCode ?? ""],
        ["Invoice Value", (x) => x.total],
        ["Rate %", (x) => x.line.ratePercent],
        ["Taxable Value", (x) => x.line.taxable],
        ["CGST", (x) => x.line.cgst],
        ["SGST", (x) => x.line.sgst],
      ],
      lines
    );
    return sendCsv(reply, "gst-report.csv", csv);
  });
}
