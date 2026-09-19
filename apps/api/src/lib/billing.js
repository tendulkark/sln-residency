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
      subtotal: stay.summary.taxableValue,
      taxRuleId: stay.taxRule?.id ?? null,
      taxRateSnapshot: stay.summary.taxRatePercent,
      taxAmount: stay.summary.cgst + stay.summary.sgst,
      total: stay.summary.grandTotal,
      generatedById,
      isFinalized: false,
    },
  });
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

  const roomsInclTax = bookings.reduce((sum, b) => sum + Number(b.totalAmount), 0);
  const chargeRows = charges.filter((c) => c.type === "charge");
  const chargesTotal = chargeRows.reduce((sum, c) => sum + Number(c.amount), 0);
  const discountTotal = charges.filter((c) => c.type === "discount").reduce((sum, c) => sum + Number(c.amount), 0);

  // A discount reduces the room charge's taxable base — GST is split off
  // the room amount *after* the discount, never off the pre-discount total
  // (a flat post-tax rupee deduction would overstate what was actually
  // taxed and understate the taxable value on the printed invoice).
  const netRoomsInclTax = Math.round((roomsInclTax - discountTotal) * 100) / 100;
  const taxRule = await getApplicableTaxRule(prisma, tenantId, netRoomsInclTax);
  const roomTaxSplit = taxRule ? splitInclusiveTax(netRoomsInclTax, taxRule.ratePercent) : { taxable: netRoomsInclTax, cgst: 0, sgst: 0, taxAmount: 0 };

  // Each charge (extra bed, damages, ...) carries its own GST-inclusive
  // amount and its own rate — set via the GST calculator when the charge
  // was added, since ancillary items can be taxed at a different slab than
  // room tariff. Summed alongside the room split so invoice/report totals
  // reflect every rupee of GST actually collected, not just on rooms.
  const chargesTaxSplit = chargeRows.reduce(
    (acc, c) => {
      const rate = Number(c.taxRatePercent) || 0;
      const split = rate > 0 ? splitInclusiveTax(Number(c.amount), rate) : { taxable: Number(c.amount), cgst: 0, sgst: 0, taxAmount: 0 };
      return {
        taxable: Math.round((acc.taxable + split.taxable) * 100) / 100,
        cgst: Math.round((acc.cgst + split.cgst) * 100) / 100,
        sgst: Math.round((acc.sgst + split.sgst) * 100) / 100,
        taxAmount: Math.round((acc.taxAmount + split.taxAmount) * 100) / 100,
      };
    },
    { taxable: 0, cgst: 0, sgst: 0, taxAmount: 0 }
  );

  const grandTotal = Math.round((roomsInclTax + chargesTotal - discountTotal) * 100) / 100;
  const advancePaid = payments
    .filter((p) => !["failed", "refunded"].includes(p.status.code))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = Math.round((grandTotal - advancePaid) * 100) / 100;

  return {
    primary,
    bookings,
    charges,
    payments,
    taxRule,
    summary: {
      nights: nightsBetween(primary.checkIn, primary.checkOut),
      roomsInclTax,
      taxableValue: Math.round((roomTaxSplit.taxable + chargesTaxSplit.taxable) * 100) / 100,
      taxRatePercent: taxRule ? Number(taxRule.ratePercent) : 0,
      cgst: Math.round((roomTaxSplit.cgst + chargesTaxSplit.cgst) * 100) / 100,
      sgst: Math.round((roomTaxSplit.sgst + chargesTaxSplit.sgst) * 100) / 100,
      chargesTotal,
      chargesTaxAmount: chargesTaxSplit.taxAmount,
      discountTotal,
      grandTotal,
      advancePaid,
      balanceDue,
    },
  };
}
