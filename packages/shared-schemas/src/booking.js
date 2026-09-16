import { z } from "zod";
import { guestSchema } from "./guest.js";

// A booking is created either against an existing guest (guestId) or with
// inline guest details (guest) that the API creates on the fly — never both.
export const createBookingSchema = z
  .object({
    roomId: z.string().min(1),
    guestId: z.string().min(1).optional(),
    guest: guestSchema.pick({ name: true, phone: true, email: true }).optional(),
    checkIn: z.coerce.date(),
    checkOut: z.coerce.date(),
    adults: z.coerce.number().int().positive().default(1),
    children: z.coerce.number().int().min(0).default(0),
    ratePerNight: z.coerce.number().positive(),
    notes: z.string().optional().nullable(),
  })
  .refine((data) => data.checkOut > data.checkIn, {
    message: "checkOut must be after checkIn",
    path: ["checkOut"],
  })
  .refine((data) => data.guestId || data.guest?.name, {
    message: "Either guestId or guest.name is required",
    path: ["guest"],
  });

export const updateBookingSchema = z
  .object({
    roomId: z.string().min(1),
    checkIn: z.coerce.date(),
    checkOut: z.coerce.date(),
    adults: z.coerce.number().int().positive(),
    children: z.coerce.number().int().min(0),
    ratePerNight: z.coerce.number().positive(),
    notes: z.string().optional().nullable(),
  })
  .partial();

export const updateBookingStatusSchema = z.object({
  statusId: z.string().min(1),
  actualCheckIn: z.coerce.date().optional(),
  actualCheckOut: z.coerce.date().optional(),
});
