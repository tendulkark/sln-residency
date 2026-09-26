// GST helpers. Never hardcode a rate — always look up the TaxRule row active
// for the tenant/amount/date (AI_RULES.md #4). The CGST/SGST split (even
// halves of the total rate) is the standard intra-state GST convention.

// A rule's slab is the half-open tariff range (appliesAboveAmount,
// appliesBelowAmount]: "above" is strictly greater, "up to" includes the
// amount itself, so a tariff sitting exactly on a boundary belongs to the
// lower slab only (product decision 2026-09-26). `amount` is always the
// tariff per room per night BEFORE GST — the value of supply GST slabs are
// defined on.
export function slabIncludes(rule, amount) {
  const aboveOk = rule.appliesAboveAmount == null || amount > Number(rule.appliesAboveAmount);
  const belowOk = rule.appliesBelowAmount == null || amount <= Number(rule.appliesBelowAmount);
  return aboveOk && belowOk;
}

async function activeRulesOn(prisma, tenantId, onDate) {
  const rules = await prisma.taxRule.findMany({
    where: {
      tenantId,
      isActive: true,
      effectiveFrom: { lte: onDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
    },
  });
  // Settings → Tax rules refuses overlapping slabs, so at most one rule
  // should ever match; the order only makes any leftover tie (rules saved
  // before that check existed) resolve the same way every time — to the
  // higher rate, the side that never under-collects GST.
  return rules.sort((a, b) => Number(b.ratePercent) - Number(a.ratePercent) || a.id.localeCompare(b.id));
}

// The rule for a pre-GST nightly tariff (a room type's basePrice).
export async function getApplicableTaxRule(prisma, tenantId, amount, onDate = new Date()) {
  const rules = await activeRulesOn(prisma, tenantId, onDate);
  return rules.find((rule) => slabIncludes(rule, amount)) ?? null;
}

// The rule for a GST-INCLUSIVE nightly tariff (Booking.ratePerNight). The
// slab still has to be judged on the pre-GST tariff, which depends on the
// rate being applied — so each rule is tried with the tariff backed out at
// its own rate, and the one whose slab that pre-GST figure lands in wins.
// A handful of inclusive prices just above a boundary fit no rule that way
// (e.g. with 5% up to ₹7,500 and 18% above: ₹8,000 all-in is ₹7,619 before
// 5% GST — over the 5% slab — but ₹6,780 before 18% — under the 18% slab);
// those fall back to comparing the inclusive price itself, which puts them
// in the higher slab rather than under-collecting.
export async function getApplicableTaxRuleForInclusive(prisma, tenantId, inclusiveAmount, onDate = new Date()) {
  const rules = await activeRulesOn(prisma, tenantId, onDate);
  const consistent = rules.find((rule) => slabIncludes(rule, round2(inclusiveAmount / (1 + Number(rule.ratePercent) / 100))));
  return consistent ?? rules.find((rule) => slabIncludes(rule, inclusiveAmount)) ?? null;
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
