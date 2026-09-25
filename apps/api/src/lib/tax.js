// GST helpers. Never hardcode a rate — always look up the TaxRule row active
// for the tenant/amount/date (AI_RULES.md #4). The CGST/SGST split (even
// halves of the total rate) is the standard intra-state GST convention.

export async function getApplicableTaxRule(prisma, tenantId, amount, onDate = new Date()) {
  const rules = await prisma.taxRule.findMany({
    where: {
      tenantId,
      isActive: true,
      effectiveFrom: { lte: onDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
    },
  });

  return (
    rules.find((rule) => {
      const aboveOk = rule.appliesAboveAmount == null || amount >= Number(rule.appliesAboveAmount);
      const belowOk = rule.appliesBelowAmount == null || amount <= Number(rule.appliesBelowAmount);
      return aboveOk && belowOk;
    }) ?? null
  );
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function splitTax(amount, ratePercent) {
  const taxAmount = round2(amount * (Number(ratePercent) / 100));
  const half = round2(taxAmount / 2);
  return {
    cgst: half,
    sgst: round2(taxAmount - half),
    taxAmount,
    total: round2(amount + taxAmount),
  };
}

// Inverse of splitTax: given a tax-INCLUSIVE total (e.g. a booking's stored
// totalAmount, which already includes GST), back out the taxable value and
// the CGST/SGST that apply to it. CGST and SGST are each levied on the
// taxable value at half the rate, so they're always equal to the paisa;
// whatever paisa that leaves between taxable + CGST + SGST and the amount
// the guest actually pays is the invoice's round-off (±0.01 typically),
// the standard way an Indian tax invoice reconciles an inclusive tariff.
export function splitInclusiveTax(totalInclTax, ratePercent) {
  const rate = Number(ratePercent);
  const taxable = round2(totalInclTax / (1 + rate / 100));
  const half = round2((taxable * rate) / 200);
  const taxAmount = round2(half * 2);
  return { taxable, cgst: half, sgst: half, taxAmount, roundOff: round2(totalInclTax - taxable - taxAmount) };
}

// Resolves a room's live nightly pricing (base + CGST/SGST/total) from its
// room type's basePrice and the tenant's currently-applicable TaxRule.
// Shared by rooms.routes.js (Rooms Setup pricing display) and
// bookings.routes.js (group-booking per-room pricing).
export async function priceRoom(prisma, tenantId, basePrice) {
  const amount = Number(basePrice);
  const taxRule = await getApplicableTaxRule(prisma, tenantId, amount);
  const pricing = taxRule ? splitTax(amount, taxRule.ratePercent) : { cgst: 0, sgst: 0, taxAmount: 0, total: amount };
  return { basePrice: amount, ...pricing, ratePercent: taxRule ? Number(taxRule.ratePercent) : 0 };
}
