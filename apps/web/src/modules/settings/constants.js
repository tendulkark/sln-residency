import { Settings, Building2, Percent, Wallet, Tags } from "lucide-react";

// Settings module constants — the hub's route, its tabs (each gated on its
// own permission), the sidebar entry (shown to anyone who can open at least
// one tab), and the React Query cache keys. TENANT_QUERY_KEY is also read
// by ProvisionalBillModal for the printed letterhead.
export const SETTINGS_ROUTE_PATH = "/settings";

export const SETTINGS_TABS = [
  { path: "hotel", label: "Hotel profile", permission: "settings.manage", icon: Building2 },
  { path: "tax-rules", label: "Tax rules", permission: "taxrules.manage", icon: Percent },
  { path: "payment-methods", label: "Payment methods", permission: "paymentmethods.manage", icon: Wallet },
  { path: "statuses", label: "Statuses", permission: "statuses.manage", icon: Tags },
];

export const settingsTabPath = (tab) => `${SETTINGS_ROUTE_PATH}/${tab.path}`;

export const SETTINGS_NAV_ITEM = {
  to: SETTINGS_ROUTE_PATH,
  label: "Settings",
  permission: SETTINGS_TABS.map((t) => t.permission),
  icon: Settings,
};

export const TENANT_QUERY_KEY = "tenant";
export const TAX_RULES_QUERY_KEY = "tax-rules";
// Every method incl. switched-off ones, with usage — the Settings list. The
// pickers' active-only list is PAYMENT_METHODS_QUERY_KEY in common/.
export const PAYMENT_METHODS_ADMIN_QUERY_KEY = ["payment-methods", "all"];
