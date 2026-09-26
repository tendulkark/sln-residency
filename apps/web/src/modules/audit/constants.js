import { History } from "lucide-react";

// Audit Log module constants — its route, sidebar entry (gated on
// auditlog.view) and cache keys.
export const AUDIT_ROUTE_PATH = "/audit-log";

export const AUDIT_NAV_ITEM = {
  to: AUDIT_ROUTE_PATH,
  label: "Audit Log",
  permission: "auditlog.view",
  icon: History,
};

export const AUDIT_LOGS_QUERY_KEY = "audit-logs";
export const auditLogsKey = (filters, page) => [AUDIT_LOGS_QUERY_KEY, filters, page];
export const AUDIT_FACETS_QUERY_KEY = [AUDIT_LOGS_QUERY_KEY, "facets"];
