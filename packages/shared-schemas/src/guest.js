import { z } from "zod";

export const guestSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1).optional().nullable(),
  email: z.string().email().optional().nullable(),
  idProofType: z.string().min(1).optional().nullable(),
  idProofNumber: z.string().min(1).optional().nullable(),
  address: z.string().min(1).optional().nullable(),
});
