import { getApplicableTaxRule, splitInclusiveTax } from "#src/lib/tax.js";

// Based on the highest existing suffix, not a row count — a count-based
// scheme collides forever once any invoice is missing from the sequence
// (a rolled-back transaction, a deleted test row), since count() never
// reflects the gap. Callers that can race (concurrent booking creation,
// concurrent checkout) still need their own P2002 retry — this alone only
// closes the gap-after-deletion case, not the read-then-write race.
export async function nextInvoiceNumber(prisma, tenantId) {
  const prefix = `INV-${new Date().getFullYear()}-`;
  const latest = await prisma.invoice.findFirst({
    where: { tenantId, invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  const nextSeq = latest ? Number(latest.invoiceNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(nextSeq).padStart(5, "0")}`;
}

// Reserves a real, permanent invoice number for a stay the moment it's
// booked — not at checkout — so it's visible on every print from booking
// onward. `stay` is the breakdown at reservation time (usually just the
// room charge plus whatever charges/discount/advance were entered on the
// booking form); isFinalized stays false until checkout recomputes final
// figures against the TaxRule active *then* and locks them in.
export async function createReservedInvoice(prisma, { tenantId, bookingId, generatedById, stay }) {
  return prisma.invoice.create({
    data: {
      tenantId,
      bookingId,
      invoiceNumber: await nextInvoiceNumber(prisma, tenantId),
      ...invoiceFiguresFrom(stay),
      generatedById,
      isFinalized: false,
    },
  });
}

// The guest/company fields worth freezing onto a finalized Invoice
// (Invoice.guestSnapshot) — the same shape `InvoiceDocument`'s "Billed To"
// block reads off `bookings[0].guest`, so a snapshot can be swapped in for
// the live row without the frontend needing to know the difference.
export function guestSnapshotFrom(guest) {
  return {
    name: guest.name,
    phone: guest.phone,
    phone2: guest.phone2,
    email: guest.email,
    address: guest.address,
    idProofType: guest.idProofType,
    idProofNumber: guest.idProofNumber,
    companyName: guest.companyName,
    gstin: guest.gstin,
  };
}

// A checked-out booking's stay details, charges, and payments are locked
// against ordinary edits — the same reasoning as a finalized invoice
// (AI_RULES.md #4): the printed Tax Invoice was computed from this data,
// so silently changing it after the fact would leave the invoice wrong
// with no trace. `bookings.correct` (admin-only by default, not a
// hardcoded role check) is the deliberate override for genuine
// corrections — routes that accept it still expect the caller to reissue
// the invoice afterward (invoices.routes.js `POST /invoices/:id/cancel`)
// if one was already finalized.
export function isBookingLocked(status) {
  return status.code === "checked_out";
}

export const BOOKING_INCLUDE = {
  room: { select: { id: true, roomNumber: true, floor: true, roomType: { select: { name: true } } } },
  guest: {
    select: {
      id: true,
      name: true,
      phone: true,
      phone2: true,
      email: true,
      address: true,
      idProofType: true,
      idProofNumber: true,
      companyName: true,
      gstin: true,
    },
  },
  status: { select: { id: true, code: true, label: true, color: true, isTerminal: true } },
};

// Nights are billed in rolling 24-hour blocks from the exact check-in
// timestamp, not by calendar day — check in Mon 6pm / check out Tue 6pm is
// 1 night, Tue 6:01pm is 2. A stay under 24h still bills as 1 night.
export function nightsBetween(checkIn, checkOut) {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

// The full "Manage Stay" / invoice picture for a booking: itself plus every
// sibling that shares its groupCode (a group booking splits one guest
// across several rooms but is billed as one stay), all ad-hoc charges/
// discounts, all payments, and the computed billing breakdown. Shared by
// bookings.routes.js (live "Manage Stay" view) and invoices.routes.js
// (the snapshot taken at invoice-generation time), so they can never drift.
export async function computeStayBreakdown(prisma, tenantId, bookingId) {
  const primary = await prisma.booking.findFirst({
    where: { id: bookingId, tenantId },
    include: BOOKING_INCLUDE,
  });
  if (!primary) return null;

  const bookings = primary.groupCode
    ? await prisma.booking.findMany({
        where: { tenantId, groupCode: primary.groupCode },
        include: BOOKING_INCLUDE,
        orderBy: { room: { roomNumber: "asc" } },
      })
    : [primary];

  const bookingIds = bookings.map((b) => b.id);

  const [charges, payments] = await Promise.all([
    prisma.bookingCharge.findMany({ where: { bookingId: { in: bookingIds } }, orderBy: { createdAt: "asc" } }),
    prisma.payment.findMany({
      where: { bookingId: { in: bookingIds } },
      include: { method: true, status: true },
      orderBy: { recordedAt: "asc" },
    }),
  ]);

  // A cancelled/no-show room owes nothing — only rooms that were (or still
  // will be) actually stayed in are billed. When every room in the stay is
  // void, so is everything else on it (charges, discount): the whole stay
  // then shows a zero bill and whatever the guest paid as money to refund.
  const billable = bookings.filter((b) => !isVoidStatus(b.status));
  const stayIsVoid = billable.length === 0;

  const roomsInclTax = round2(billable.reduce((sum, b) => sum + Number(b.totalAmount), 0));
  const chargeRows = stayIsVoid ? [] : charges.filter((c) => c.type === "charge");
  const chargesTotal = round2(chargeRows.reduce((sum, c) => sum + Number(c.amount), 0));
  const discountEntered = stayIsVoid ? 0 : round2(charges.filter((c) => c.type === "discount").reduce((sum, c) => sum + Number(c.amount), 0));
  // A discount is a concession on the room tariff, so it can never take the
  // rooms below zero (routes refuse such a discount up front; this only
  // guards the case where the room total later shrinks under an existing
  // one, e.g. an early checkout billed on the actual stay).
  const discountTotal = Math.min(discountEntered, roomsInclTax);

  // A discount reduces the room charge's taxable base — GST is split off
  // the room amount *after* the discount, never off the pre-discount total
  // (a flat post-tax rupee deduction would overstate what was actually
  // taxed and understate the taxable value on the printed invoice).
  const netRoomsInclTax = round2(roomsInclTax - discountTotal);
  // GST slabs for hotel rooms go by the tariff per room per night, not by
  // the whole stay's total — look the rule up with the highest nightly rate
  // in the stay, so a slab rule (appliesAbove/BelowAmount) picks correctly.
  const nightlyTariff = billable.reduce((max, b) => Math.max(max, Number(b.ratePerNight)), 0);
  const taxRule = await getApplicableTaxRule(prisma, tenantId, nightlyTariff);
  const roomRate = taxRule ? Number(taxRule.ratePercent) : 0;

  // Rate-wise GST lines (what the invoice's tax table and the GST report
  // file under): the room tariff at the TaxRule's rate, plus each charge
  // (extra bed, food, damages, ...) at the rate it was entered with via the
  // GST calculator — ancillary items can sit on a different slab than the
  // room. Amounts are grouped per rate first and split once per rate, so
  // rounding happens once per line rather than once per item.
  const inclusiveByRate = new Map();
  const addAtRate = (rate, amount) => inclusiveByRate.set(rate, round2((inclusiveByRate.get(rate) ?? 0) + amount));
  if (netRoomsInclTax > 0 || chargeRows.length === 0) addAtRate(roomRate, netRoomsInclTax);
  const chargesByRate = new Map();
  for (const c of chargeRows) {
    const rate = Number(c.taxRatePercent) || 0;
    addAtRate(rate, Number(c.amount));
    chargesByRate.set(rate, round2((chargesByRate.get(rate) ?? 0) + Number(c.amount)));
  }

  const taxLines = [...inclusiveByRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ratePercent, inclusive]) => {
      const split = ratePercent > 0 ? splitInclusiveTax(inclusive, ratePercent) : { taxable: inclusive, cgst: 0, sgst: 0, taxAmount: 0 };
      return { ratePercent, taxable: split.taxable, cgst: split.cgst, sgst: split.sgst };
    });
  const chargesTaxAmount = round2(
    [...chargesByRate.entries()].reduce((sum, [rate, amount]) => sum + (rate > 0 ? splitInclusiveTax(amount, rate).taxAmount : 0), 0)
  );

  const taxableValue = round2(taxLines.reduce((sum, l) => sum + l.taxable, 0));
  const cgst = round2(taxLines.reduce((sum, l) => sum + l.cgst, 0));
  const sgst = round2(taxLines.reduce((sum, l) => sum + l.sgst, 0));
  const grandTotal = round2(roomsInclTax + chargesTotal - discountTotal);

  // Money in minus money handed back. "failed"/"refunded" statuses mark a
  // payment that never really landed (or was reversed wholesale), so those
  // count for neither side.
  const counted = payments.filter((p) => !["failed", "refunded"].includes(p.status.code));
  const amountReceived = round2(counted.filter((p) => p.type !== "refund").reduce((sum, p) => sum + Number(p.amount), 0));
  const refundedTotal = round2(counted.filter((p) => p.type === "refund").reduce((sum, p) => sum + Number(p.amount), 0));
  const advancePaid = round2(amountReceived - refundedTotal);
  const balanceDue = round2(grandTotal - advancePaid);

  return {
    primary,
    bookings,
    charges,
    payments,
    taxRule,
    summary: {
      nights: nightsBetween(primary.checkIn, primary.checkOut),
      stayIsVoid,
      roomsInclTax,
      taxableValue,
      taxRatePercent: roomRate,
      cgst,
      sgst,
      roundOff: round2(grandTotal - taxableValue - cgst - sgst),
      taxLines,
      chargesTotal,
      chargesTaxAmount,
      discountTotal,
      discountEntered,
      grandTotal,
      amountReceived,
      refundedTotal,
      // Net of refunds — what the guest has actually paid towards the bill.
      advancePaid,
      balanceDue,
    },
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Cancelled / no-show: a terminal status that isn't a completed stay.
export function isVoidStatus(status) {
  return status.isTerminal && status.code !== "checked_out";
}

// The invoice's stored figures for a stay — shared by reservation,
// finalize, reissue, and the "keep the reserved invoice current" refresh
// below, so the Invoices list and GST report always match the document.
export function invoiceFiguresFrom(stay) {
  return {
    subtotal: stay.summary.taxableValue,
    taxRuleId: stay.taxRule?.id ?? null,
    taxRateSnapshot: stay.summary.taxRatePercent,
    taxAmount: round2(stay.summary.cgst + stay.summary.sgst),
    total: stay.summary.grandTotal,
  };
}

// Everything the printed invoice shows, frozen at finalize/reissue time
// (Invoice.snapshot). JSON round-trip turns Prisma Decimals/Dates into the
// same strings the API already sends, so the frontend reads it unchanged.
export function invoiceSnapshotFrom(stay) {
  return JSON.parse(JSON.stringify({ bookings: stay.bookings, charges: stay.charges, payments: stay.payments, summary: stay.summary }));
}

// A reserved (not-yet-finalized) invoice's stored figures are only a
// preview, but the Invoices list shows them — so after anything that
// changes the bill (dates, rate, room, charges, discount) they're
// recomputed to match. A finalized invoice is never touched here.
export async function refreshReservedInvoice(prisma, tenantId, bookingId) {
  const stay = await computeStayBreakdown(prisma, tenantId, bookingId);
  if (!stay) return;
  const invoice = await prisma.invoice.findFirst({
    where: { tenantId, bookingId: { in: stay.bookings.map((b) => b.id) }, isCancelled: false, isFinalized: false },
  });
  if (!invoice) return;
  await prisma.invoice.update({ where: { id: invoice.id }, data: invoiceFiguresFrom(stay) });
}
