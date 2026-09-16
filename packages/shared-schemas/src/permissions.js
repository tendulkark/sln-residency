// Canonical catalog of permission codes. This is the one place a permission
// *code* is spelled out in application code — routes declare which code they
// require, and prisma/seed.js loads this list into the Permission table.
// Which role has which permission is entirely data (RolePermission rows),
// editable by an Admin — never hardcoded per-role here.

export const PERMISSIONS = [
  { code: "rooms.view", description: "View rooms and their status" },
  { code: "rooms.edit", description: "Create/edit rooms" },
  { code: "roomtypes.view", description: "View room types" },
  { code: "roomtypes.edit", description: "Create/edit room types and pricing" },
  { code: "bookings.view", description: "View bookings" },
  { code: "bookings.create", description: "Create a booking" },
  { code: "bookings.edit", description: "Edit a booking" },
  { code: "bookings.cancel", description: "Cancel a booking" },
  { code: "guests.view", description: "View guest records" },
  { code: "guests.edit", description: "Create/edit guest records" },
  { code: "payments.view", description: "View recorded payments" },
  { code: "payments.record", description: "Record a manual payment against a booking" },
  { code: "invoices.view", description: "View invoices" },
  { code: "invoices.generate", description: "Generate an invoice for a booking" },
  { code: "statuses.manage", description: "Manage room/booking/payment status lists" },
  { code: "taxrules.manage", description: "Manage GST/tax rule slabs" },
  { code: "users.manage", description: "Manage staff accounts" },
  { code: "roles.manage", description: "Manage roles and their permissions" },
  { code: "reports.view", description: "View occupancy/revenue/GST reports" },
  { code: "auditlog.view", description: "View the audit log" },
];

// Default permission sets used only to seed a brand-new tenant's built-in
// Admin/Employee roles. After seeding, an Admin can freely edit these via
// the roles.manage UI — this list is not consulted again at runtime.
export const DEFAULT_ADMIN_PERMISSION_CODES = PERMISSIONS.map((p) => p.code);

export const DEFAULT_EMPLOYEE_PERMISSION_CODES = [
  "rooms.view",
  "roomtypes.view",
  "bookings.view",
  "bookings.create",
  "bookings.edit",
  "guests.view",
  "guests.edit",
  "payments.view",
  "payments.record",
  "invoices.view",
];
