import { z } from "zod";

export const roomSchema = z.object({
  roomNumber: z.string().min(1),
  floor: z.string().min(1).optional().nullable(),
  roomTypeId: z.string().min(1),
});

export const updateRoomSchema = roomSchema.partial();

export const updateRoomStatusSchema = z.object({
  statusId: z.string().min(1),
});
