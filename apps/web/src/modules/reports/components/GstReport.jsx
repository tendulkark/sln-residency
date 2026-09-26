import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Landmark, Printer } from "lucide-react";
import { apiFetch, downloadFile } from "@/lib/api.js";
import { formatDate, formatMoney } from "@/lib/format.js";
import { Button, DataTable, EmptyState, SegmentedControl, Td, Tf, Th, Tr } from "@/ui/index.js";
import InvoiceModal from "@/modules/invoices/components/InvoiceModal.jsx";
import { REPORTS_GST_QUERY_KEY } from "@/modules/reports/constants.js";
import { InfoTip, KpiCard, KpiGrid, Pager, ReportLoadState, ReportPanel, Refetching } from "@/modules/reports/components/reportParts.jsx";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "b2b", label: "B2B" },
  { value: "b2c", label: "B2C" },
];

const INVOICE_COLUMNS = [
  { label: "Invoice", width: 160, pinned: true },
  { label: "Date", width: 120 },
  { label: "Billed to", width: 210 },
  { label: "GSTIN", width: 170 },
  { label: "Room", width: 80 },
  { label: "SAC", width: 80 },
  { label: "Rate", width: 90, align: "right" },
  { label: "Taxable value", width: 130, align: "right" },
  { label: "CGST", width: 110, align: "right" },
  { label: "SGST", width: 110, align: "right" },
  { label: "Invoice value", width: 130, align: "right" },
];
const INVOICE_TABLE_WIDTH = INVOICE_COLUMNS.reduce((s, c) => s + c.width, 0);

function SplitCard({ title, hint, figures, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border p-4 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ${
        active ? "border-brand bg-brand-tint" : "border-line bg-card hover:bg-muted"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-brand/75">{title}</p>
      <p className="text-xs text-ink-muted">{hint}</p>
      <p className="mt-2 text-xl font-bold tabular-nums text-ink">
        {figures.invoices} <span className="text-sm font-medium text-ink-muted">invoice{figures.invoices === 1 ? "" : "s"}</span>
      </p>
      <p className="mt-1 text-xs tabular-nums text-ink-soft">
        Taxable {formatMoney(figures.taxable)} · GST {formatMoney(figures.tax)}
      </p>
    </button>
  );
}

// GST collected, the way the monthly return is filed: totals, the
// B2B (issued to a GSTIN) / B2C split, rate-wise summary, and invoice by
// invoice. Only finalized, still-active invoices count — a cancelled one
// was replaced by its reissue, which carries the real figures.
export default function GstReport({ from, to }) {
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("50");
  const [invoiceBookingId, setInvoiceBookingId] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  useEffect(() => setPage(1), [from, to, pageSize, type]);

  const typeParam = type === "all" ? {} : { type };
  const query = useQuery({
    queryKey: [REPORTS_GST_QUERY_KEY, from, to, type, page, pageSize],
    queryFn: () => apiFetch(`/reports/gst?${new URLSearchParams({ from, to, page: String(page), pageSize, ...typeParam })}`),
    placeholderData: keepPreviousData,
  });
  const { data } = query;

  async function downloadCsv() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadFile(`/reports/gst.csv?${new URLSearchParams({ from, to, ...typeParam })}`, `gst-${type}-${from}-to-${to}.csv`);
    } catch (err) {
      setDownloadError(`Couldn't download the CSV — ${err.message}`);
    } finally {
      setDownloading(false);
    }
  }

  if (data === undefined) return <ReportLoadState query={query} title="Couldn't load the GST report" cards={5} />;

  const { totals } = data;
  const missingSac = data.rows.some((r) => !r.sacCode);

  return (
    <Refetching active={query.isFetching && query.isPlaceholderData}>
      <KpiGrid columns={5}>
        <KpiCard label="Taxable value" value={formatMoney(totals.taxable)} sub={`${totals.invoices} invoice${totals.invoices === 1 ? "" : "s"}`} />
        <KpiCard label="CGST" value={formatMoney(totals.cgst)} />
        <KpiCard label="SGST" value={formatMoney(totals.sgst)} />
        <KpiCard label="Total GST" value={formatMoney(totals.tax)} />
        <KpiCard label="Invoice value" value={formatMoney(totals.total)} sub="Incl. GST and round-off" />
      </KpiGrid>

      {totals.invoices === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No tax invoices finalized in this period"
          subtitle={data.cancelledCount ? `${data.cancelledCount} cancelled invoice(s) in this period are kept for the record.` : "Invoices appear here once a stay is checked out."}
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SplitCard title="B2B" hint="Issued to a GSTIN — filed invoice by invoice" figures={data.b2b} active={type === "b2b"} onClick={() => setType(type === "b2b" ? "all" : "b2b")} />
            <SplitCard title="B2C" hint="No GSTIN — filed as rate-wise totals" figures={data.b2c} active={type === "b2c"} onClick={() => setType(type === "b2c" ? "all" : "b2c")} />
            <ReportPanel title="Cancelled invoices">
              <p className="text-xl font-bold tabular-nums text-ink">{data.cancelledCount}</p>
              <p className="mt-1 text-xs text-ink-muted">Kept for the record (never deleted) and left out of every total here — each was replaced by its reissue.</p>
            </ReportPanel>
          </div>

          <ReportPanel className="mb-4" title="By tax rate">
            <DataTable maxHeight="none" minWidth="640px">
              <thead>
                <tr>
                  <Th pinned>GST rate</Th>
                  <Th align="right">Invoices</Th>
                  <Th align="right">Taxable value</Th>
                  <Th align="right">CGST</Th>
                  <Th align="right">SGST</Th>
                  <Th align="right">Total GST</Th>
                </tr>
              </thead>
              <tbody>
                {data.byRate.map((r) => (
                  <Tr key={r.ratePercent}>
                    <Td pinned className="font-medium text-ink">
                      {r.ratePercent}%
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {r.invoices}
                    </Td>
                    <Td align="right" className="whitespace-nowrap tabular-nums">
                      {formatMoney(r.taxable)}
                    </Td>
                    <Td align="right" className="whitespace-nowrap tabular-nums">
                      {formatMoney(r.cgst)}
                    </Td>
                    <Td align="right" className="whitespace-nowrap tabular-nums">
                      {formatMoney(r.sgst)}
                    </Td>
                    <Td align="right" className="whitespace-nowrap font-semibold tabular-nums">
                      {formatMoney(r.tax)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <Tf pinned>Total</Tf>
                  <Tf align="right" className="tabular-nums">
                    {totals.invoices}
                  </Tf>
                  <Tf align="right" className="whitespace-nowrap tabular-nums">
                    {formatMoney(totals.taxable)}
                  </Tf>
                  <Tf align="right" className="whitespace-nowrap tabular-nums">
                    {formatMoney(totals.cgst)}
                  </Tf>
                  <Tf align="right" className="whitespace-nowrap tabular-nums">
                    {formatMoney(totals.sgst)}
                  </Tf>
                  <Tf align="right" className="whitespace-nowrap tabular-nums">
                    {formatMoney(totals.tax)}
                  </Tf>
                </tr>
              </tfoot>
            </DataTable>
            <p className="mt-2 text-xs text-ink-muted">An invoice with items at two rates (e.g. a room at 5% and food at 18%) counts under both rates, so the rate rows can add up to more invoices than the total.</p>
          </ReportPanel>

          <ReportPanel
            title="Invoices"
            actions={
              <>
                <InfoTip label="About this export">
                  <p>The CSV has one line per invoice per tax rate, the way GSTR-1's B2B section is filed, with B2B/B2C, GSTIN and SAC on every line so it can be filtered either way.</p>
                  {missingSac && <p>SAC is blank because your GST rule has no SAC code set yet (accommodation is usually 9963).</p>}
                </InfoTip>
                <Button variant="outline" size="sm" onClick={downloadCsv} loading={downloading}>
                  {!downloading && <Download className="h-4 w-4" />}
                  Download GSTR-1 CSV
                </Button>
              </>
            }
          >
            {downloadError && <div className="mb-3 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{downloadError}</div>}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
              <SegmentedControl size="sm" options={TYPE_OPTIONS} value={type} onChange={setType} />
              <Pager page={data.page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={setPageSize} />
            </div>

            {data.rows.length === 0 ? (
              <EmptyState icon={Landmark} title={`No ${type.toUpperCase()} invoices in this period`} />
            ) : (
              <DataTable fixed minWidth={`${INVOICE_TABLE_WIDTH}px`} maxHeight="65vh">
                <colgroup>
                  {INVOICE_COLUMNS.map((c) => (
                    <col key={c.label} style={{ width: c.width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {INVOICE_COLUMNS.map((c) => (
                      <Th key={c.label} align={c.align} pinned={c.pinned}>
                        {c.label}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <Tr key={r.id} className="align-top">
                      <Td pinned>
                        <p className="whitespace-nowrap font-medium text-ink">{r.invoiceNumber}</p>
                        <button
                          type="button"
                          onClick={() => setInvoiceBookingId(r.bookingId)}
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline print:hidden"
                        >
                          <Printer className="h-3 w-3" />
                          Reprint
                        </button>
                      </Td>
                      <Td className="whitespace-nowrap">{formatDate(r.date)}</Td>
                      <Td>
                        <p className="truncate font-medium text-ink" title={r.companyName || r.guestName}>
                          {r.companyName || r.guestName}
                        </p>
                        {r.companyName && <p className="truncate text-xs text-ink-muted">{r.guestName}</p>}
                      </Td>
                      <Td className="truncate font-mono text-xs">{r.gstin ?? <span className="font-sans text-ink-faint">— (B2C)</span>}</Td>
                      <Td>{r.room}</Td>
                      <Td className="tabular-nums">{r.sacCode ?? <span className="text-ink-faint">—</span>}</Td>
                      <Td align="right" className="whitespace-nowrap tabular-nums">
                        {r.rates.map((rate) => `${rate}%`).join(" + ")}
                      </Td>
                      <Td align="right" className="whitespace-nowrap tabular-nums">
                        {formatMoney(r.taxable)}
                      </Td>
                      <Td align="right" className="whitespace-nowrap tabular-nums">
                        {formatMoney(r.cgst)}
                      </Td>
                      <Td align="right" className="whitespace-nowrap tabular-nums">
                        {formatMoney(r.sgst)}
                      </Td>
                      <Td align="right" className="whitespace-nowrap font-semibold tabular-nums">
                        {formatMoney(r.total)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </ReportPanel>
        </>
      )}

      {invoiceBookingId && <InvoiceModal bookingId={invoiceBookingId} autoGenerate={false} onClose={() => setInvoiceBookingId(null)} />}
    </Refetching>
  );
}
