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
// the CGST/SGST that must have applied.
export function splitInclusiveTax(totalInclTax, ratePercent) {
  const taxable = round2(totalInclTax / (1 + Number(ratePercent) / 100));
  const taxAmount = round2(totalInclTax - taxable);
  const half = round2(taxAmount / 2);
  return { taxable, cgst: half, sgst: round2(taxAmount - half), taxAmount };
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
