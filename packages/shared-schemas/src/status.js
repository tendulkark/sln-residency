import { z } from "zod";

export const STATUS_DOMAINS = ["room", "booking", "payment"];

// The status codes the app's own workflow looks up by code — check-in sets
// the room "occupied", checkout sets it "dirty", the dashboard buckets rooms
// by these, reports skip "cancelled"/"no_show", a "failed" payment never
// counts as money received, and so on. Every tenant is seeded with exactly
// these (Status.isSystem = true), and their code, domain and terminal flag
// can never change: only what staff *see* — label, color, order — is the
// tenant's to edit (Settings → Statuses).
export const WORKFLOW_STATUS_CODES = {
  room: ["available", "occupied", "dirty", "cleaning", "maintenance"],
  booking: ["pending", "confirmed", "checked_in", "checked_out", "no_show", "cancelled"],
  payment: ["pending", "partial", "paid", "refunded", "failed"],
};

// Which statuses may be made a domain's default, i.e. what a new record
// starts in. Only a booking's is a real choice (some hotels treat every
// booking as confirmed the moment it's taken). A new room must start
// "available" — Housekeeping's "Mark clean" also returns rooms to the
// default — and payments are always recorded as settled, so those two
// defaults stay fixed.
export const DEFAULTABLE_STATUS_CODES = {
  room: [],
  booking: ["pending", "confirmed"],
  payment: [],
};

const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #1a7f4b");

// What an Admin may change on a status. `isDefault` only ever means "make
// this the default" — a domain always has exactly one, so the way to move
// it is to pick another, never to clear it.
export const statusUpdateSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(40).optional(),
  color: hexColor.optional(),
  isDefault: z.literal(true).optional(),
});

// The full new top-to-bottom order of one domain's statuses.
export const statusOrderSchema = z.object({
  domain: z.enum(STATUS_DOMAINS),
  ids: z.array(z.string().min(1)).min(1),
});
