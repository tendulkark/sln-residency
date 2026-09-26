// Canonical catalog of permission codes. This is the one place a permission
// *code* is spelled out in application code — routes declare which code they
// require, and prisma/seed.js loads this list into the Permission table.
// Which role has which permission is entirely data (RolePermission rows),
// editable by an Admin — never hardcoded per-role here.

export const PERMISSIONS = [
  { code: "rooms.view", description: "View rooms and their status" },
  { code: "rooms.edit", description: "Create/edit rooms" },
  { code: "rooms.housekeeping", description: "Update room housekeeping status (mark clean/dirty/maintenance)" },
  { code: "roomclosures.manage", description: "Block a room from availability for a date range" },
  { code: "roomtypes.view", description: "View room types" },
  { code: "roomtypes.edit", description: "Create/edit room types and pricing" },
  { code: "bookings.view", description: "View bookings" },
  { code: "bookings.create", description: "Create a booking" },
  { code: "bookings.edit", description: "Edit a booking" },
  { code: "bookings.cancel", description: "Cancel a booking" },
  { code: "bookings.correct", description: "Edit a checked-out booking's stay details, charges, and payments (admin-only correction)" },
  { code: "guests.view", description: "View guest records" },
  { code: "guests.edit", description: "Create/edit guest records" },
  { code: "guests.correct", description: "Correct guest/company details (e.g. a missed GSTIN) on a past booking and reissue its invoice" },
  { code: "payments.view", description: "View recorded payments" },
  { code: "payments.record", description: "Record a manual payment against a booking" },
  { code: "invoices.view", description: "View invoices" },
  { code: "invoices.generate", description: "Generate an invoice for a booking" },
  { code: "invoices.cancel", description: "Cancel a wrong invoice and reissue a replacement" },
  { code: "invoices.customize", description: "Change the printed invoice's layout, colors, visible fields, and footer wording" },
  { code: "statuses.manage", description: "Rename, recolor and reorder room/booking/payment statuses" },
  { code: "taxrules.manage", description: "Manage GST/tax rule slabs" },
  { code: "paymentmethods.manage", description: "Add, rename and switch off payment methods" },
  { code: "users.manage", description: "Manage staff accounts" },
  { code: "roles.manage", description: "Manage roles and their permissions" },
  { code: "reports.view", description: "View occupancy/revenue/GST reports" },
  { code: "auditlog.view", description: "View the audit log" },
  { code: "settings.manage", description: "Manage hotel profile (name, address, logo, GSTIN) and branding" },
];

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code);

// Default permission sets used only to seed a brand-new tenant's built-in
// Admin/Manager/Employee roles. After seeding, an Admin can freely edit the
// Manager/Employee (and any custom) roles via Roles & Permissions — these
// lists are not consulted again at runtime. The built-in Admin role is the
// exception: it always holds the whole catalog (apps/api/src/lib/
// permissions.js), so no edit can ever lock a hotel out of its own console.
export const DEFAULT_ADMIN_PERMISSION_CODES = PERMISSION_CODES;

// A Manager runs the desk day-to-day with everything an Admin has *except*
// the post-checkout correction powers — once a stay is checked out and its
// tax invoice finalized, only an Admin may edit it or cancel & reissue the
// invoice (bookings.routes.js/payments.routes.js `isBookingLocked` gate,
// invoices.routes.js `POST /invoices/:id/cancel`) — and the two account-
// admin permissions, since anyone who can edit roles or staff can grant
// themselves everything else anyway. Invoice design is Admin-only by
// product decision (2026-09-24).
const MANAGER_EXCLUDED_PERMISSION_CODES = new Set([
  "bookings.correct",
  "guests.correct",
  "invoices.cancel",
  "invoices.customize",
  "users.manage",
  "roles.manage",
]);

export const DEFAULT_MANAGER_PERMISSION_CODES = DEFAULT_ADMIN_PERMISSION_CODES.filter(
  (code) => !MANAGER_EXCLUDED_PERMISSION_CODES.has(code)
);

export const DEFAULT_EMPLOYEE_PERMISSION_CODES = [
  "rooms.view",
  "rooms.housekeeping",
  "roomtypes.view",
  "bookings.view",
  "bookings.create",
  "bookings.edit",
  "guests.view",
  "guests.edit",
  "payments.view",
  "payments.record",
  "invoices.view",
  "invoices.generate",
];
