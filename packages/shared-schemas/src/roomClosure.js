import { z } from "zod";

export const roomClosureSchema = z
  .object({
    roomId: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().min(1).optional().nullable(),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });
