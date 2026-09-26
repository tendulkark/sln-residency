import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History, X } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatDate, formatTime } from "@/lib/format.js";
import { Button, Input, Select, PageHeader, EmptyState, ErrorState, TableSkeleton, Spinner, DataTable, Th, Td, Tr } from "@/ui/index.js";
import AuditDetailModal from "@/modules/audit/components/AuditDetailModal.jsx";
import { auditLogsKey, AUDIT_FACETS_QUERY_KEY } from "@/modules/audit/constants.js";
import { actionLabel, entityTypeLabel, summarize } from "@/modules/audit/auditFormat.js";

const PAGE_SIZE = 50;
// URL param → API query param. Filters live in the URL so a filtered view
// (e.g. one booking's history) survives a refresh and can be shared.
const FILTERS = { from: "from", to: "to", user: "userId", type: "entityType", action: "action", entity: "entityId" };

// The Audit Log (auditlog.view): every change staff made — who, what, when —
// newest first (AI_RULES.md #9). Read-only; nothing here can alter a row.
export default function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  const [openRow, setOpenRow] = useState(null);
  const page = Math.max(1, Number(params.get("page")) || 1);

  const filters = Object.fromEntries(Object.keys(FILTERS).map((k) => [k, params.get(k) ?? ""]));
  const hasFilters = Object.values(filters).some(Boolean);

  function update(patch) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  }

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  for (const [k, apiKey] of Object.entries(FILTERS)) if (filters[k]) query.set(apiKey, filters[k]);

  const logsQuery = useQuery({
    queryKey: auditLogsKey(filters, page),
    queryFn: () => apiFetch(`/audit-logs?${query}`),
    placeholderData: keepPreviousData,
  });
  const facetsQuery = useQuery({ queryKey: AUDIT_FACETS_QUERY_KEY, queryFn: () => apiFetch("/audit-logs/facets") });
  const facets = facetsQuery.data;
  const data = logsQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const userOptions = [{ value: "", label: "Everyone" }, ...(facets?.users ?? []).map((u) => ({ value: u.id, label: u.isActive ? u.name : `${u.name} (inactive)` }))];
  const typeOptions = [
    { value: "", label: "Everything" },
    ...(facets?.entityTypes ?? []).map((t) => ({ value: t, label: entityTypeLabel(t) })).sort((a, b) => a.label.localeCompare(b.label)),
  ];
  const actionOptions = [
    { value: "", label: "Any action" },
    ...(facets?.actions ?? []).filter((a) => !filters.type || a.entityType === filters.type).map((a) => ({ value: a.action, label: actionLabel(a.action) })),
  ];

  return (
    <div>
      <PageHeader icon={History} title="Audit Log" subtitle="Every change made in this console — who did it, when, and to what" />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Input label="From" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} />
        <Input label="To" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} />
        <Select label="Who" options={userOptions} loading={!facets && !facetsQuery.isError} value={filters.user} onChange={(v) => update({ user: v })} />
        <Select label="Area" options={typeOptions} loading={!facets && !facetsQuery.isError} value={filters.type} onChange={(v) => update({ type: v, action: "" })} />
        <Select label="Action" options={actionOptions} loading={!facets && !facetsQuery.isError} value={filters.action} onChange={(v) => update({ action: v })} />
      </div>

      {(filters.entity || hasFilters) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {filters.entity && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-brand">
              History of {params.get("entityLabel") || "one record"}
              <button type="button" aria-label="Show all records" onClick={() => update({ entity: "", entityLabel: "" })}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {!data && !logsQuery.isError && <TableSkeleton rows={8} columns={5} />}
      {!data && logsQuery.isError && <ErrorState title="Couldn't load the audit log" error={logsQuery.error} onRetry={() => logsQuery.refetch()} />}
      {data?.rows.length === 0 && (
        <EmptyState
          icon={History}
          title={hasFilters ? "Nothing matches these filters" : "Nothing recorded yet"}
          subtitle={hasFilters ? "Try a wider date range or fewer filters." : "Changes staff make will appear here."}
          action={
            hasFilters && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear filters
              </Button>
            )
          }
        />
      )}

      {data?.rows.length > 0 && (
        <>
          <DataTable>
            <thead>
              <tr>
                <Th pinned>When</Th>
                <Th>Who</Th>
                <Th>What</Th>
                <Th>Record</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <Tr key={row.id}>
                  <Td pinned className="whitespace-nowrap">
                    <span className="block text-ink">{formatDate(row.createdAt)}</span>
                    <span className="block text-xs text-ink-muted">{formatTime(row.createdAt)}</span>
                  </Td>
                  <Td className="whitespace-nowrap">{row.user?.name ?? <span className="text-ink-muted">System</span>}</Td>
                  <Td className="whitespace-nowrap">
                    <button type="button" className="text-left font-medium text-ink hover:text-brand hover:underline" onClick={() => setOpenRow(row)}>
                      {actionLabel(row.action)}
                    </button>
                  </Td>
                  <Td className="min-w-[10rem]">
                    <button
                      type="button"
                      className="text-left hover:text-brand hover:underline"
                      title="Show every change to this record"
                      onClick={() => update({ entity: row.entityId, entityLabel: row.entityLabel ?? entityTypeLabel(row.entityType), type: "", action: "" })}
                    >
                      <span className="block text-xs text-ink-muted">{entityTypeLabel(row.entityType)}</span>
                      <span className="block text-ink-soft">{row.entityLabel ?? "Removed record"}</span>
                    </button>
                  </Td>
                  <Td className="min-w-[12rem] text-ink-soft">
                    <button type="button" className="text-left hover:text-brand" onClick={() => setOpenRow(row)}>
                      {summarize(row.metadata) || <span className="text-ink-faint">View</span>}
                    </button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>

          <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
            <p className="flex items-center gap-2">
              {data.total} entr{data.total === 1 ? "y" : "ies"}
              {logsQuery.isFetching && <Spinner label="Updating…" />}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {openRow && <AuditDetailModal row={openRow} onClose={() => setOpenRow(null)} />}
    </div>
  );
}
