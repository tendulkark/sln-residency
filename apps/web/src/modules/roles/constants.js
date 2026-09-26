import { ShieldCheck } from "lucide-react";

// Roles & Permissions module constants — its route, sidebar entry (gated on
// roles.manage), and cache keys. ROLES_QUERY_KEY is also what the Staff
// screen's role picker reads, so a role edited here shows up there at once.
export const ROLES_ROUTE_PATH = "/roles";

export const ROLES_NAV_ITEM = {
  to: ROLES_ROUTE_PATH,
  label: "Roles",
  permission: "roles.manage",
  icon: ShieldCheck,
};

export const ROLES_QUERY_KEY = "roles";
export const PERMISSIONS_QUERY_KEY = "permissions";

// How the permission catalog is grouped on screen: the part of each code
// before the dot → a heading. Only UI wording — which permissions exist is
// the API's catalog (GET /permissions), and a code whose prefix isn't
// listed here still shows, under its raw prefix.
export const PERMISSION_GROUPS = [
  { prefix: "rooms", label: "Rooms & housekeeping" },
  { prefix: "roomclosures", label: "Rooms & housekeeping" },
  { prefix: "roomtypes", label: "Room types & pricing" },
  { prefix: "bookings", label: "Bookings" },
  { prefix: "guests", label: "Guests" },
  { prefix: "payments", label: "Payments" },
  { prefix: "invoices", label: "Invoices" },
  { prefix: "reports", label: "Reports" },
  { prefix: "users", label: "Staff & roles" },
  { prefix: "roles", label: "Staff & roles" },
  { prefix: "settings", label: "Hotel settings" },
  { prefix: "taxrules", label: "Hotel settings" },
  { prefix: "paymentmethods", label: "Hotel settings" },
  { prefix: "statuses", label: "Hotel settings" },
  { prefix: "auditlog", label: "Audit log" },
];
