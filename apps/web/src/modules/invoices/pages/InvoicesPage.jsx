import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, Receipt, Eye } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatCurrency, formatDateTime } from "@/lib/format.js";
import { Button, Input, Select, Badge, PageHeader, EmptyState, DataTable, Th, Td, Tr } from "@/ui/index.js";
import InvoiceModal from "@/modules/invoices/components/InvoiceModal.jsx";
import { INVOICES_LIST_QUERY_KEY } from "@/modules/invoices/constants.js";

const STATUS_OPTIONS = [
  { value: "", label: "All invoices" },
  { value: "active", label: "Finalized only" },
  { value: "reserved", label: "Reserved (pre-checkout) only" },
  { value: "cancelled", label: "Cancelled only" },
];

// Search/browse every invoice ever issued for this tenant, active or
// cancelled — the "find a past invoice" screen that reprint buttons on
// Manage Stay / Reports don't cover on their own. Cancelled rows stay
// visible (struck-through, with their reason) rather than disappearing —
// an invoice is never hard-deleted (AI_RULES.md #4).
export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openInvoiceId, setOpenInvoiceId] = useState(null);
  const pageSize = 25;

  const { data, isLoading } = useQuery({
    queryKey: [INVOICES_LIST_QUERY_KEY, { search, status, from, to, page }],
    queryFn: () =>
      apiFetch(
        `/invoices?page=${page}&pageSize=${pageSize}` +
          (search ? `&search=${encodeURIComponent(search)}` : "") +
          (status ? `&status=${status}` : "") +
          (from ? `&from=${from}` : "") +
          (to ? `&to=${to}` : "")
      ),
    placeholderData: (prev) => prev,
  });

  function resetToFirstPage(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader icon={Receipt} title="Invoices" subtitle="Every tax invoice issued — search, reprint, or cancel & reissue a wrong one" />

      {/* A 2-column grid on phones (search full-width, then From | To, then
          Status) instead of four stacked rows — every row the filters give
          up here is a row of invoices the height-filling table below gets
          back, which matters on a 375px screen. From sm up it's the same
          single wrapping row as before. */}
      <div className="mb-4 grid shrink-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="col-span-2 sm:w-64">
          <Input
            label="Search"
            icon={Search}
            placeholder="Invoice no., guest, or room"
            value={search}
            onChange={(e) => resetToFirstPage(setSearch)(e.target.value)}
          />
        </div>
        <div className="col-span-2 order-last sm:order-none sm:w-48">
          <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={resetToFirstPage(setStatus)} />
        </div>
        <div className="min-w-0 sm:w-40">
          <Input label="From" type="date" value={from} onChange={(e) => resetToFirstPage(setFrom)(e.target.value)} />
        </div>
        <div className="min-w-0 sm:w-40">
          <Input label="To" type="date" value={to} onChange={(e) => resetToFirstPage(setTo)(e.target.value)} />
        </div>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}

      {data && data.rows.length === 0 && (
        <EmptyState icon={Receipt} title="No invoices found" subtitle="Try widening the date range or clearing filters." />
      )}

      {data && data.rows.length > 0 && (
        <>
          <DataTable fill>
              <thead>
                <tr>
                  <Th />
                  <Th pinned>Invoice No</Th>
                  <Th>Date</Th>
                  <Th>Guest</Th>
                  <Th>Room</Th>
                  <Th align="right">Total</Th>
                  <Th>Status</Th>
                  <Th>Notes</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Button size="sm" variant="outline" onClick={() => setOpenInvoiceId(r.id)}>
                        <Eye className="h-3 w-3" />
                        View
                      </Button>
                    </Td>
                    <Td pinned className={`whitespace-nowrap font-medium ${r.isCancelled ? "text-ink-faint line-through" : "text-ink"}`}>
                      {r.invoiceNumber}
                    </Td>
                    <Td className="whitespace-nowrap">{formatDateTime(r.generatedAt)}</Td>
                    <Td className="whitespace-nowrap">{r.guestName}</Td>
                    <Td>{r.room}</Td>
                    <Td align="right" className={r.isCancelled ? "text-ink-faint line-through" : "font-semibold text-ink"}>
                      {formatCurrency(r.total)}
                    </Td>
                    <Td>
                      {r.isCancelled ? (
                        <Badge tone="danger">Cancelled</Badge>
                      ) : r.isFinalized ? (
                        <Badge tone="success">Finalized</Badge>
                      ) : (
                        <Badge tone="warning">Reserved</Badge>
                      )}
                    </Td>
                    <Td className="max-w-xs text-xs text-ink-muted">
                      {r.isCancelled && (
                        <>
                          {r.cancellationReason}
                          {r.supersededByInvoiceNumber && <> — reissued as {r.supersededByInvoiceNumber}</>}
                        </>
                      )}
                      {!r.isCancelled && r.supersedesInvoiceNumber && <>Replaces {r.supersedesInvoiceNumber}</>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
          </DataTable>

          <div className="mt-3 flex shrink-0 items-center justify-between text-sm text-ink-muted">
            <p>
              {data.total} invoice{data.total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {openInvoiceId && <InvoiceModal invoiceId={openInvoiceId} onClose={() => setOpenInvoiceId(null)} />}
    </div>
  );
}
