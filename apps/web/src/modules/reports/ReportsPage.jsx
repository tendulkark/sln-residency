import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Printer, RefreshCw, Search, ReceiptText } from "lucide-react";
import { apiFetch, downloadFile } from "@/lib/api.js";
import { toISODate, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays } from "@/lib/dateRange.js";
import { formatCurrency, formatCurrencyPrecise, formatDate, formatDateTime } from "@/lib/format.js";
import { Button, Input, Select, Switch, PageHeader, DonutChart, MiniBarChart, Badge, EmptyState } from "@/ui/index.js";
import StatCard from "@/modules/dashboard/StatCard.jsx";
import InvoiceModal from "@/modules/invoices/InvoiceModal.jsx";
import { statusesKey } from "@/modules/common/constants.js";
import {
  REPORTS_BOOKINGS_QUERY_KEY,
  REPORTS_REVENUE_QUERY_KEY,
  REPORTS_OCCUPANCY_QUERY_KEY,
  REPORTS_GST_QUERY_KEY,
} from "@/modules/reports/constants.js";

const TABS = [
  { value: "bookings", label: "Bookings" },
  { value: "revenue", label: "Revenue" },
  { value: "occupancy", label: "Occupancy" },
  { value: "gst", label: "GST" },
];

// A small UI-only palette for room-type donut segments — room types aren't
// tenant-colored data (unlike Status), so this cycles rather than reading
// from the database, the same pattern RoomBoardCard uses for its computed
// buckets.
const PALETTE = ["#16a34a", "#2563eb", "#f59e0b", "#9333ea", "#dc2626", "#0d9488", "#7a1f3d", "#65a30d"];

function todayRange() {
  const today = new Date();
  return { from: toISODate(startOfMonth(today)), to: toISODate(addDays(endOfMonth(today), -1)) };
}

export default function ReportsPage() {
  const [tab, setTab] = useState("bookings");
  const [{ from, to }, setRange] = useState(todayRange());

  const isThisMonth = (() => {
    const today = new Date();
    return from === toISODate(startOfMonth(today)) && to === toISODate(addDays(endOfMonth(today), -1));
  })();
  const isThisYear = (() => {
    const today = new Date();
    return from === toISODate(startOfYear(today)) && to === toISODate(addDays(endOfYear(today), -1));
  })();

  return (
    <div>
      <PageHeader
        icon={ReceiptText}
        title="Rooms Reports"
        subtitle="Revenue, occupancy & tax analytics for rooms"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => downloadFile(`/reports/bookings.csv?from=${from}&to=${to}`, `room-bookings-${from}-to-${to}.csv`)}
            >
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              tab === t.value ? "border-brand bg-brand text-white" : "border-line-strong bg-card text-gray-700 hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          <Input label="From" type="date" value={from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          <Input label="To" type="date" value={to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          <Button variant={isThisMonth ? "solid" : "outline"} onClick={() => setRange(todayRange())}>
            This Month
          </Button>
          <Button
            variant={isThisYear ? "solid" : "outline"}
            onClick={() => {
              const today = new Date();
              setRange({ from: toISODate(startOfYear(today)), to: toISODate(addDays(endOfYear(today), -1)) });
            }}
          >
            This Year
          </Button>
        </div>
      </div>

      <div data-print-area>
        {tab === "bookings" && <BookingsReportTab from={from} to={to} />}
        {tab === "revenue" && <RevenueReportTab from={from} to={to} />}
        {tab === "occupancy" && <OccupancyReportTab from={from} to={to} />}
        {tab === "gst" && <GstReportTab from={from} to={to} />}
      </div>
    </div>
  );
}

function RangeRefreshButton({ onClick, isFetching }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={isFetching} className="print:hidden">
      <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
      Refresh
    </Button>
  );
}

function BookingsReportTab({ from, to }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [checkoutBasis, setCheckoutBasis] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("50");
  const [invoiceBookingId, setInvoiceBookingId] = useState(null);

  useEffect(() => setPage(1), [from, to, statusFilter, search, checkoutBasis, pageSize]);

  const { data: statuses } = useQuery({ queryKey: statusesKey("booking"), queryFn: () => apiFetch("/statuses?domain=booking") });
  const statusOptions = [{ value: "", label: "All statuses" }, ...(statuses ?? []).map((s) => ({ value: s.code, label: s.label }))];

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [REPORTS_BOOKINGS_QUERY_KEY, from, to, statusFilter, search, checkoutBasis, page, pageSize],
    queryFn: () =>
      apiFetch(
        `/reports/bookings?${new URLSearchParams({
          from,
          to,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(search ? { search } : {}),
          checkoutBasis: String(checkoutBasis),
          page: String(page),
          pageSize,
        })}`
      ),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden">
        <RangeRefreshButton onClick={refetch} isFetching={isFetching} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Bookings" value={data?.counts.bookings ?? "—"} />
        <StatCard label="Total Rooms" value={data?.counts.totalRooms ?? "—"} />
        <StatCard label="Cancelled" value={data?.counts.cancelled ?? "—"} />
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-lg border border-line-strong bg-muted p-3 print:hidden">
        <Switch checked={checkoutBasis} onChange={setCheckoutBasis} />
        <p className="text-xs text-gray-500">
          {checkoutBasis
            ? "Showing Checked-out bookings by checkout date — the same rows the Revenue tab counts."
            : "Showing bookings by check-in date, all statuses. Toggle on to see exactly the rows Revenue counted instead (Checked-out, filtered by checkout date)."}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-line-strong bg-brand-tint p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-brand/75">Bookings by Status</p>
          <DonutChart data={(data?.byStatus ?? []).map((s) => ({ label: s.label, value: s.count, color: s.color }))} />
        </div>
        <div className="rounded-lg border border-line-strong bg-gold-tint p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gold-dark">Bookings by Room Type</p>
          <DonutChart data={(data?.byRoomType ?? []).map((rt, i) => ({ label: rt.name, value: rt.count, color: PALETTE[i % PALETTE.length] }))} />
        </div>
      </div>

      <p className="mb-4 text-xs text-gray-400 print:hidden">
        Room rates include GST, so a discount comes off the inclusive price first: Taxable Value + CGST + SGST = Grand Total, and Grand
        Total + Other Charges = Total. Other Charges (food, damages) carry no GST.
        <br />
        Taxable Value / CGST / SGST show "—" until a booking is Checked-out — tax is only finalized at checkout, so a Confirmed,
        Checked-in, or Cancelled row has no real tax figure to show yet.
      </p>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64">
            <Input icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guest name / phone / room" />
          </div>
          <div className="w-44">
            <Select options={statusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-28">
            <Select options={[{ value: "25", label: "25 / page" }, { value: "50", label: "50 / page" }, { value: "100", label: "100 / page" }]} value={pageSize} onChange={setPageSize} />
          </div>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <p className="whitespace-nowrap text-sm text-gray-500">
            Page {page} of {totalPages} · {data?.total ?? 0} total
          </p>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {data && data.rows.length === 0 && <EmptyState icon={ReceiptText} title="No bookings in this range" subtitle="Try widening the date range or clearing filters." />}

      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line-strong bg-card shadow-sm">
          <table className="w-full min-w-[1900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-muted text-xs uppercase tracking-wide text-gray-500">
                <Th>SL</Th>
                <Th />
                <Th>Invoice No</Th>
                <Th>Guest</Th>
                <Th>Room</Th>
                <Th>Type</Th>
                <Th>Booked By</Th>
                <Th>Check-in</Th>
                <Th>Check-out</Th>
                <Th>Nights</Th>
                <Th>Actual In</Th>
                <Th>Checked In By</Th>
                <Th>Actual Out</Th>
                <Th>Checked Out By</Th>
                <Th>GSTIN</Th>
                <Th align="right">Taxable Value</Th>
                <Th align="right">CGST</Th>
                <Th align="right">SGST</Th>
                <Th align="right">Discount</Th>
                <Th align="right">Grand Total</Th>
                <Th align="right">Other Charges</Th>
                <Th align="right">Retained</Th>
                <Th align="right">Advance</Th>
                <Th align="right">Total</Th>
                <Th>Status</Th>
                <Th>Cancelled By</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.id} className="border-b border-line-soft align-top odd:bg-muted/40 hover:bg-brand-tint">
                  <Td>{(data.page - 1) * data.pageSize + i + 1}</Td>
                  <Td>
                    {r.invoiceNumber && (
                      <Button size="sm" variant="outline" className="print:hidden" onClick={() => setInvoiceBookingId(r.id)}>
                        <Printer className="h-3 w-3" />
                        Reprint
                      </Button>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap font-medium text-gray-900">{r.invoiceNumber ?? "-"}</Td>
                  <Td className="whitespace-nowrap">{r.guest.name}</Td>
                  <Td>{r.room}</Td>
                  <Td className="whitespace-nowrap">{r.roomType}</Td>
                  <Td className="whitespace-nowrap">{r.bookedBy ?? "-"}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(r.checkIn)}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(r.checkOut)}</Td>
                  <Td>{r.nights}</Td>
                  <Td className="whitespace-nowrap">{r.actualCheckIn ? formatDateTime(r.actualCheckIn) : "-"}</Td>
                  <Td className="whitespace-nowrap">{r.checkedInBy ?? "-"}</Td>
                  <Td className="whitespace-nowrap">{r.actualCheckOut ? formatDateTime(r.actualCheckOut) : "-"}</Td>
                  <Td className="whitespace-nowrap">{r.checkedOutBy ?? "-"}</Td>
                  <Td>{r.guest.gstin ?? "-"}</Td>
                  <Td align="right">{r.taxableValue != null ? formatCurrencyPrecise(r.taxableValue) : "-"}</Td>
                  <Td align="right">{r.cgst != null ? formatCurrencyPrecise(r.cgst) : "-"}</Td>
                  <Td align="right">{r.sgst != null ? formatCurrencyPrecise(r.sgst) : "-"}</Td>
                  <Td align="right">{r.discount != null ? `- ${formatCurrencyPrecise(r.discount)}` : "-"}</Td>
                  <Td align="right">{r.grandTotal != null ? formatCurrencyPrecise(r.grandTotal) : "-"}</Td>
                  <Td align="right">{r.otherCharges != null ? formatCurrencyPrecise(r.otherCharges) : "-"}</Td>
                  <Td align="right">{r.retained != null ? formatCurrencyPrecise(r.retained) : "-"}</Td>
                  <Td align="right">{r.advance != null ? formatCurrencyPrecise(r.advance) : "-"}</Td>
                  <Td align="right" className="font-semibold text-gray-900">
                    {r.total != null ? formatCurrencyPrecise(r.total) : "-"}
                  </Td>
                  <Td>
                    <Badge color={r.status.color}>{r.status.label}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">{r.cancelledBy ?? "-"}</Td>
                  <Td className="max-w-[220px] whitespace-pre-line text-xs text-gray-500">{r.notes ?? "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoiceBookingId && <InvoiceModal bookingId={invoiceBookingId} autoGenerate={false} onClose={() => setInvoiceBookingId(null)} />}
    </div>
  );
}

function RevenueReportTab({ from, to }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [REPORTS_REVENUE_QUERY_KEY, from, to],
    queryFn: () => apiFetch(`/reports/revenue?from=${from}&to=${to}`),
  });

  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden">
        <RangeRefreshButton onClick={refetch} isFetching={isFetching} />
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Collected" value={formatCurrency(data.total)} />
            {data.byMethod.map((m) => (
              <StatCard key={m.name} label={m.name} value={formatCurrency(m.amount)} />
            ))}
          </div>

          <div className="rounded-lg border border-line-strong bg-muted p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-brand/75">Daily Collections</p>
            <MiniBarChart data={data.daily.map((d) => ({ label: d.date, value: d.amount }))} format={formatCurrency} />
          </div>

          {data.daily.length === 0 && <EmptyState icon={ReceiptText} title="No payments recorded in this range" />}
        </>
      )}
    </div>
  );
}

function OccupancyReportTab({ from, to }) {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [REPORTS_OCCUPANCY_QUERY_KEY, from, to],
    queryFn: () => apiFetch(`/reports/occupancy?from=${from}&to=${to}`),
  });

  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden">
        <RangeRefreshButton onClick={refetch} isFetching={isFetching} />
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Average Occupancy" value={`${data.avgOccupancyPercent}%`} />
            <StatCard label="Total Rooms" value={data.totalRooms} />
          </div>

          <div className="rounded-lg border border-line-strong bg-muted p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-brand/75">Daily Occupancy %</p>
            <MiniBarChart data={data.daily.map((d) => ({ label: d.date, value: d.occupancyPercent }))} format={(v) => `${v}%`} />
          </div>
        </>
      )}
    </div>
  );
}

function GstReportTab({ from, to }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("50");

  useEffect(() => setPage(1), [from, to, pageSize]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: [REPORTS_GST_QUERY_KEY, from, to, page, pageSize],
    queryFn: () => apiFetch(`/reports/gst?${new URLSearchParams({ from, to, page: String(page), pageSize })}`),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden">
        <RangeRefreshButton onClick={refetch} isFetching={isFetching} />
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Taxable Value" value={formatCurrency(data.totalTaxable)} />
            <StatCard label="CGST Collected" value={formatCurrency(data.totalCGST)} />
            <StatCard label="SGST Collected" value={formatCurrency(data.totalSGST)} />
          </div>

          {data.byRate.length > 0 && (
            <div className="mb-4 rounded-lg border border-line-strong bg-gold-tint p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gold-dark">By Tax Rate</p>
              <div className="space-y-2">
                {data.byRate.map((r) => (
                  <div key={r.ratePercent} className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-sm shadow-sm">
                    <span className="text-gray-700">
                      GST {r.ratePercent}% · {r.count} invoice(s)
                    </span>
                    <span className="text-gray-900">
                      Taxable {formatCurrencyPrecise(r.taxable)} · CGST {formatCurrencyPrecise(r.cgst)} · SGST {formatCurrencyPrecise(r.sgst)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.rows.length === 0 ? (
            <EmptyState icon={ReceiptText} title="No invoices generated in this range" />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-end gap-2 print:hidden">
                <div className="w-28">
                  <Select
                    options={[{ value: "25", label: "25 / page" }, { value: "50", label: "50 / page" }, { value: "100", label: "100 / page" }]}
                    value={pageSize}
                    onChange={setPageSize}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <p className="whitespace-nowrap text-sm text-gray-500">
                  Page {page} of {totalPages} · {data.total} total
                </p>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-line-strong bg-card shadow-sm">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-muted text-xs uppercase tracking-wide text-gray-500">
                      <Th>Invoice No</Th>
                      <Th>Date</Th>
                      <Th>Guest</Th>
                      <Th>Room</Th>
                      <Th align="right">Taxable Value</Th>
                      <Th align="right">CGST</Th>
                      <Th align="right">SGST</Th>
                      <Th align="right">Total</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.invoiceNumber} className="border-b border-line-soft odd:bg-muted/40 hover:bg-brand-tint">
                        <Td className="font-medium text-gray-900">{r.invoiceNumber}</Td>
                        <Td className="whitespace-nowrap">{formatDate(r.date)}</Td>
                        <Td className="whitespace-nowrap">{r.guestName}</Td>
                        <Td>{r.room}</Td>
                        <Td align="right">{formatCurrencyPrecise(r.taxable)}</Td>
                        <Td align="right">{formatCurrencyPrecise(r.cgst)}</Td>
                        <Td align="right">{formatCurrencyPrecise(r.sgst)}</Td>
                        <Td align="right" className="font-semibold text-gray-900">
                          {formatCurrencyPrecise(r.total)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Th({ children, align = "left" }) {
  return <th className={`px-3 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ children, align = "left", className = "" }) {
  return <td className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${className}`}>{children}</td>;
}
