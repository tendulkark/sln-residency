import { z } from "zod";

// "refund" hands money back to the guest (an overpayment, or a cancelled
// stay's advance) — recorded as its own row, never by editing or deleting
// the original payment, so the money trail stays complete.
export const PAYMENT_TYPES = ["payment", "refund"];

export const recordPaymentSchema = z.object({
  bookingId: z.string().min(1),
  type: z.enum(PAYMENT_TYPES).default("payment"),
  methodId: z.string().min(1),
  statusId: z.string().min(1),
  amount: z.coerce.number().positive(),
  referenceNote: z.string().optional().nullable(),
  // When the guest actually paid, if different from "now" — defaults to
  // the moment the payment is recorded.
  paidAt: z.coerce.date().optional(),
});
