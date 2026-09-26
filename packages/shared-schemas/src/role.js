import { z } from "zod";

// A custom role: a name plus the permission codes it grants. Which codes
// exist is the PERMISSIONS catalog (permissions.js); the API rejects any
// code not in it.
export const roleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  permissionCodes: z.array(z.string().min(1)).default([]),
});

export const roleUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40).optional(),
  permissionCodes: z.array(z.string().min(1)).optional(),
});
