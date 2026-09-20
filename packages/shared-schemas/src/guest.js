import { z } from "zod";

// Government ID proof types accepted at check-in in India. A fixed
// structural enum (like BookingCharge.type), not tenant-configurable data,
// so it lives here rather than in a per-tenant config table.
export const ID_PROOF_TYPES = [
  { value: "aadhaar", label: "Aadhaar" },
  { value: "driving_license", label: "Driving License" },
  { value: "passport", label: "Passport" },
  { value: "pan", label: "PAN" },
];

export const guestSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1).optional().nullable(),
  phone2: z.string().min(1).optional().nullable(),
  email: z.string().email().optional().nullable(),
  idProofType: z
    .enum(ID_PROOF_TYPES.map((t) => t.value))
    .optional()
    .nullable(),
  idProofNumber: z.string().min(1).optional().nullable(),
  address: z.string().min(1).optional().nullable(),
  companyName: z.string().min(1).optional().nullable(),
  gstin: z.string().min(1).optional().nullable(),
});

// Same fields, all optional at the key level — a PATCH only sends the
// fields the admin actually changed, not a full guest record.
export const guestUpdateSchema = guestSchema.partial();
