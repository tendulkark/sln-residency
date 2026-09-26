import { z } from "zod";

// A way a guest can pay at the desk (Cash, UPI, Card, ...). Only the name
// is typed by staff — the API derives the stable `code` from it on create
// and never changes it afterwards.
export const paymentMethodSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
});

export const paymentMethodUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40).optional(),
  isActive: z.boolean().optional(),
});
