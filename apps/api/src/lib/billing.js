import { getApplicableTaxRule, splitInclusiveTax } from "./tax.js";

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
  const chargesTotal = charges.filter((c) => c.type === "charge").reduce((sum, c) => sum + Number(c.amount), 0);
  const discountTotal = charges.filter((c) => c.type === "discount").reduce((sum, c) => sum + Number(c.amount), 0);

  // A discount reduces the room charge's taxable base — GST is split off
  // the room amount *after* the discount, never off the pre-discount total
  // (a flat post-tax rupee deduction would overstate what was actually
  // taxed and understate the taxable value on the printed invoice).
  const netRoomsInclTax = Math.round((roomsInclTax - discountTotal) * 100) / 100;
  const taxRule = await getApplicableTaxRule(prisma, tenantId, netRoomsInclTax);
  const taxSplit = taxRule ? splitInclusiveTax(netRoomsInclTax, taxRule.ratePercent) : { taxable: netRoomsInclTax, cgst: 0, sgst: 0, taxAmount: 0 };

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
      taxableValue: taxSplit.taxable,
      taxRatePercent: taxRule ? Number(taxRule.ratePercent) : 0,
      cgst: taxSplit.cgst,
      sgst: taxSplit.sgst,
      chargesTotal,
      discountTotal,
      grandTotal,
      advancePaid,
      balanceDue,
    },
  };
}
