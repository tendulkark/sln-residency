import { formatCurrencyExact } from "@/lib/format.js";
import { toISODate } from "@/lib/dateRange.js";

// Display helpers for Settings → Tax rules. A slab is the half-open tariff
// range (above, upTo] on the tariff per room per night before GST — the
// same reading the API's lib/tax.js applies when it bills a stay.

export function slabLabel(rule) {
  const above = rule.appliesAboveAmount;
  const upTo = rule.appliesBelowAmount;
  if (above == null && upTo == null) return "Any tariff";
  if (above == null) return `Up to ${formatCurrencyExact(upTo)}`;
  if (upTo == null) return `Above ${formatCurrencyExact(above)}`;
  return `Above ${formatCurrencyExact(above)}, up to ${formatCurrencyExact(upTo)}`;
}

// Where a rule stands on `day` (a YYYY-MM-DD string).
export function ruleState(rule, day) {
  if (!rule.isActive) return "off";
  const from = toISODate(rule.effectiveFrom);
  const to = rule.effectiveTo ? toISODate(rule.effectiveTo) : null;
  if (from > day) return "scheduled";
  if (to && to < day) return "ended";
  return "inForce";
}

// The rules in force on `day`, low tariff to high, with any tariff range no
// rule covers called out as a gap (a room priced there would carry no GST).
export function slabLadder(rules, day) {
  const inForce = rules
    .filter((r) => ruleState(r, day) === "inForce")
    .sort((a, b) => (a.appliesAboveAmount ?? -1) - (b.appliesAboveAmount ?? -1));
  const steps = [];
  let coveredTo = null; // tariff covered so far; null = nothing yet
  let started = false;
  for (const rule of inForce) {
    const above = rule.appliesAboveAmount;
    if (!started && above != null) steps.push({ gap: true, above: null, upTo: above });
    if (started && coveredTo != null && above != null && above > coveredTo) steps.push({ gap: true, above: coveredTo, upTo: above });
    steps.push({ rule });
    started = true;
    coveredTo = rule.appliesBelowAmount;
    if (coveredTo == null) break; // open-ended top slab covers everything above
  }
  if (started && coveredTo != null) steps.push({ gap: true, above: coveredTo, upTo: null });
  return steps;
}

export function toFormValues(rule) {
  const today = toISODate(new Date());
  return {
    name: rule?.name ?? "",
    ratePercent: rule?.ratePercent ?? "",
    hsnSacCode: rule?.hsnSacCode ?? "",
    appliesAboveAmount: rule?.appliesAboveAmount ?? "",
    appliesBelowAmount: rule?.appliesBelowAmount ?? "",
    effectiveFrom: rule ? toISODate(rule.effectiveFrom) : today,
    effectiveTo: rule?.effectiveTo ? toISODate(rule.effectiveTo) : "",
    isActive: rule?.isActive ?? true,
  };
}

export function toPayload(values) {
  const amountOrNull = (v) => (v === "" || v == null ? null : Number(v));
  return {
    name: values.name.trim(),
    ratePercent: Number(values.ratePercent),
    hsnSacCode: values.hsnSacCode.trim() || null,
    appliesAboveAmount: amountOrNull(values.appliesAboveAmount),
    appliesBelowAmount: amountOrNull(values.appliesBelowAmount),
    effectiveFrom: values.effectiveFrom,
    effectiveTo: values.effectiveTo || null,
    isActive: values.isActive,
  };
}
