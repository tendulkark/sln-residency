import { z } from "zod";

// How a tenant's printed Tax Invoice / Provisional Bill looks — layout,
// colors, typography, which optional fields show, and footer wording. Pure
// presentation: nothing here can change an invoice's figures, number, or
// the fields GST law requires on a tax invoice (title, supplier GSTIN,
// number/date, tax breakdown, signatory), which InvoiceDocument always
// renders regardless of these settings.

export const INVOICE_LAYOUTS = [
  { value: "classic", label: "Classic", description: "Accent strip, tinted panels, solid table header" },
  { value: "modern", label: "Modern", description: "Full-width colored header band" },
  { value: "minimal", label: "Minimal", description: "White background, thin rules — saves ink" },
];

export const INVOICE_FONTS = [
  { value: "sans", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Typewriter" },
];

export const INVOICE_FONT_SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

export const INVOICE_LOGO_PLACEMENTS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "hidden", label: "Hidden" },
];

export const INVOICE_LINE_SPACINGS = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
];

// Percent of the layout's default size, for the header's hotel name and
// contact lines.
export const INVOICE_TEXT_SCALE = { min: 60, max: 140, step: 5 };

export const INVOICE_LOGO_SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const values = (options) => options.map((o) => o.value);

const textScale = z
  .number()
  .int()
  .min(INVOICE_TEXT_SCALE.min)
  .max(INVOICE_TEXT_SCALE.max)
  .refine((v) => v % INVOICE_TEXT_SCALE.step === 0, `Must be a multiple of ${INVOICE_TEXT_SCALE.step}`)
  .default(100);

// Every field has a default, so a tenant with no saved design (and a design
// saved before a newer option existed) still renders completely.
const invoiceTemplateShape = {
  layout: z.enum(values(INVOICE_LAYOUTS)).default("classic"),
  // "" follows the hotel brand color from Settings.
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #7a1f3d")
    .or(z.literal(""))
    .default(""),
  fontFamily: z.enum(values(INVOICE_FONTS)).default("sans"),
  fontSize: z.enum(values(INVOICE_FONT_SIZES)).default("medium"),
  logoPlacement: z.enum(values(INVOICE_LOGO_PLACEMENTS)).default("center"),
  logoSize: z.enum(values(INVOICE_LOGO_SIZES)).default("medium"),
  hotelNameScale: textScale,
  hotelDetailsScale: textScale,
  hotelDetailsSpacing: z.enum(values(INVOICE_LINE_SPACINGS)).default("normal"),

  showHotelAddress: z.boolean().default(true),
  showHotelPhone: z.boolean().default(true),
  showHotelEmail: z.boolean().default(true),

  showGuestContact: z.boolean().default(true),
  showGuestAddress: z.boolean().default(true),
  showGuestIdProof: z.boolean().default(true),
  showGuestCount: z.boolean().default(true),
  showCheckInOutTime: z.boolean().default(true),
  showPaymentBreakdown: z.boolean().default(true),

  thankYouNote: z.string().trim().max(500).default("Thank you for staying with us.\nWe hope to see you again soon."),
  bankDetails: z.string().trim().max(1000).default(""),
  termsAndConditions: z.string().trim().max(2000).default(""),
  footerNote: z.string().trim().max(120).default("System Generated Invoice"),
  signatoryLabel: z.string().trim().min(1, "Signatory label is required").max(60).default("Authorized Signatory"),
  // A data: URL, like Tenant.logoUrl. Capped so the whole PUT body stays
  // well inside Fastify's default 1 MiB request limit.
  signatureImageUrl: z
    .string()
    .max(450_000, "Signature image is too large")
    .refine((v) => v === "" || v.startsWith("data:image/"), "Signature must be an image")
    .default(""),
};

// Input validation for PUT /invoice-template — unknown keys are rejected.
export const invoiceTemplateSchema = z.object(invoiceTemplateShape).strict();

const storedInvoiceTemplateSchema = z.object(invoiceTemplateShape);

export const DEFAULT_INVOICE_TEMPLATE = storedInvoiceTemplateSchema.parse({});

// Stored JSON -> a complete design. Rows only ever get written through
// invoiceTemplateSchema, so a parse failure means an option was retired
// since; falling back to defaults keeps every bill printable.
export function resolveInvoiceTemplate(stored) {
  const parsed = storedInvoiceTemplateSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : DEFAULT_INVOICE_TEMPLATE;
}
