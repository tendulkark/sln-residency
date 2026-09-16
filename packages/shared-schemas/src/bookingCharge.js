import { z } from "zod";

export const bookingChargeSchema = z.object({
  type: z.enum(["charge", "discount"]),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
});
