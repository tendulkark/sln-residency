import { DASHBOARD_NAV_ITEM } from "@/modules/dashboard/constants.js";
import { ROOMS_NAV_ITEM } from "@/modules/rooms/constants.js";
import { HOUSEKEEPING_NAV_ITEM } from "@/modules/housekeeping/constants.js";
import { RESERVATIONS_NAV_ITEM } from "@/modules/reservations/constants.js";
import { INVOICES_NAV_ITEM } from "@/modules/invoices/constants.js";
import { REPORTS_NAV_ITEM } from "@/modules/reports/constants.js";
import { SETTINGS_NAV_ITEM } from "@/modules/settings/constants.js";

// Each entry is owned by its module's own constants.js (to/label/permission/
// icon) — this just assembles them in sidebar order. Shared by AdminShell
// (which renders the sidebar) and router.jsx (which gates each page on the
// same permission, so a URL typed by hand can't open a page the sidebar
// hides). Both are UX niceties only — the API re-checks every request
// regardless (AI_RULES.md #3).
export const NAV_ITEMS = [
  DASHBOARD_NAV_ITEM,
  ROOMS_NAV_ITEM,
  HOUSEKEEPING_NAV_ITEM,
  RESERVATIONS_NAV_ITEM,
  INVOICES_NAV_ITEM,
  REPORTS_NAV_ITEM,
  SETTINGS_NAV_ITEM,
  // Staff management lands in a later phase.
];

// The first page the signed-in user is actually allowed to see — where the
// bare "/" lands, and where a denied page offers to send them. Null only if
// their role has no page permissions at all.
export function firstAllowedNavItem(permissions) {
  return NAV_ITEMS.find((item) => permissions.has(item.permission)) ?? null;
}
