import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const amount = z.coerce.number().min(0).max(10_000_000);

// A GST slab for the room tariff. Slabs are matched on the tariff per room
// per night BEFORE GST (the value of supply), and read as a half-open range:
// "above" is strictly greater than, "up to" includes the amount itself — so
// ₹7,500 exactly falls in an "up to ₹7,500" slab, never also in an "above
// ₹7,500" one (product decision 2026-09-26). Either bound may be empty.
// Dates are whole days in the hotel's timezone: the rule starts at the
// start of `effectiveFrom` and ends at the end of `effectiveTo`.
const taxRuleFields = {
  name: z.string().trim().min(1, "Name is required").max(60),
  ratePercent: z.coerce.number().min(0).max(100),
  hsnSacCode: z
    .string()
    .trim()
    .regex(/^(\d{4,8})?$/, "SAC/HSN code is 4–8 digits")
    .optional()
    .nullable()
    .transform((v) => v || null),
  appliesAboveAmount: amount.nullable().optional(),
  appliesBelowAmount: amount.nullable().optional(),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullable().optional(),
  isActive: z.boolean().optional(),
};

function checkRanges(rule, ctx) {
  if (rule.appliesAboveAmount != null && rule.appliesBelowAmount != null && rule.appliesBelowAmount <= rule.appliesAboveAmount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["appliesBelowAmount"], message: "“Up to” must be more than “above”" });
  }
  if (rule.effectiveFrom && rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "End date can't be before the start date" });
  }
}

export const taxRuleSchema = z.object(taxRuleFields).superRefine(checkRanges);
export const taxRuleUpdateSchema = z.object(taxRuleFields).partial().superRefine(checkRanges);
