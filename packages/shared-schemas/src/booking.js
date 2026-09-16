import { z } from "zod";
import { guestSchema } from "./guest.js";

const advancePaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  methodId: z.string().min(1),
  statusId: z.string().min(1),
});

const bookingDiscountSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.coerce.number().positive(),
});

// A booking is created either against an existing guest (guestId) or with
// inline guest details (guest) that the API creates on the fly — never both.
// It targets either a single room (roomId + ratePerNight, the existing
// path) or a group booking across several rooms at once (roomIds — each
// room is priced from its own current rate, so no client-supplied rate is
// needed there). advancePayments records one or more real Payment rows
// (split across methods) alongside booking creation rather than a typed-in
// number; an optional discount records a real BookingCharge the same way.
// checkInImmediately skips the separate check-in step for a walk-in guest.
export const createBookingSchema = z
  .object({
    roomId: z.string().min(1).optional(),
    roomIds: z.array(z.string().min(1)).min(2).optional(),
    guestId: z.string().min(1).optional(),
    guest: guestSchema.pick({ name: true, phone: true, email: true }).optional(),
    checkIn: z.coerce.date(),
    checkOut: z.coerce.date(),
    adults: z.coerce.number().int().positive().default(1),
    children: z.coerce.number().int().min(0).default(0),
    ratePerNight: z.coerce.number().positive().optional(),
    notes: z.string().optional().nullable(),
    advancePayments: z.array(advancePaymentSchema).optional(),
    discount: bookingDiscountSchema.optional(),
    checkInImmediately: z.boolean().optional(),
  })
  .refine((data) => data.checkOut > data.checkIn, {
    message: "checkOut must be after checkIn",
    path: ["checkOut"],
  })
  .refine((data) => data.guestId || data.guest?.name, {
    message: "Either guestId or guest.name is required",
    path: ["guest"],
  })
  .refine((data) => Boolean(data.roomId) !== Boolean(data.roomIds), {
    message: "Provide either roomId (single room) or roomIds (group booking), not both",
    path: ["roomId"],
  })
  .refine((data) => !data.roomId || data.ratePerNight, {
    message: "ratePerNight is required for a single-room booking",
    path: ["ratePerNight"],
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
