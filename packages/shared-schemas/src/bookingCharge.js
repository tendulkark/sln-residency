import { z } from "zod";

export const bookingChargeSchema = z.object({
  type: z.enum(["charge", "discount"]),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  // GST already folded into `amount`; only meaningful for type "charge".
  taxRatePercent: z.coerce.number().min(0).max(100).optional(),
});
