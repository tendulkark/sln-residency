import { z } from "zod";

// Hotel letterhead/profile shown on printed invoices and the staff console
// sidebar. Every field is optional so a tenant can fill these in gradually
// from the Settings screen.
export const tenantSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().trim().max(500).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  gstin: z.string().trim().max(20).optional().nullable(),
  primaryColor: z.string().trim().max(20).optional().nullable(),
  // A data: URL for the uploaded logo image. Capped well under Postgres's
  // text limits so a stray huge upload can't bloat every tenant row.
  logoUrl: z
    .string()
    .max(2_000_000)
    .refine((v) => v === "" || v.startsWith("data:image/"), "Logo must be an image")
    .optional()
    .nullable(),
});
