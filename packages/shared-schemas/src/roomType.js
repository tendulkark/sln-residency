import { z } from "zod";

export const roomTypeSchema = z.object({
  name: z.string().min(1),
  basePrice: z.coerce.number().positive(),
  capacity: z.coerce.number().int().positive().default(2),
  amenities: z.array(z.string().min(1)).optional().default([]),
});

export const updateRoomTypeSchema = roomTypeSchema.partial();
