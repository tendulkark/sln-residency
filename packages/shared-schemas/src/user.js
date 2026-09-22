import { z } from "zod";

// A staff login an Admin creates for a worker — name/email/role are
// editable later via PATCH, but a fresh account always needs a starting
// password (AI_RULES.md #1: which role is just a roleId, never a
// hardcoded role name — the caller picks from the tenant's own Role rows).
export const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().trim().email(),
  roleId: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// A PATCH only ever sends the fields actually changed — name/email/role to
// edit the account, isActive to enable/disable it. Never the password;
// that's always its own dedicated action (reset-password), so it can carry
// its own guard rails (e.g. logging the account out everywhere).
export const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().trim().email().optional(),
  roleId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// An Admin resetting another staff member's password (e.g. they're locked
// out, or it needs to be handed to a new hire).
export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Self-service password change from the Profile screen — anyone changing
// their own password must prove they still know the current one.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
