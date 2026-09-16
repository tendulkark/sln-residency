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

export function splitTax(amount, ratePercent) {
  const taxAmount = Math.round(amount * (Number(ratePercent) / 100) * 100) / 100;
  const half = Math.round((taxAmount / 2) * 100) / 100;
  return {
    cgst: half,
    sgst: taxAmount - half,
    taxAmount,
    total: Math.round((amount + taxAmount) * 100) / 100,
  };
}
