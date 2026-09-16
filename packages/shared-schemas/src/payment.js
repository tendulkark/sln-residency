import { z } from "zod";

export const recordPaymentSchema = z.object({
  bookingId: z.string().min(1),
  methodId: z.string().min(1),
  statusId: z.string().min(1),
  amount: z.coerce.number().positive(),
  referenceNote: z.string().optional().nullable(),
});
