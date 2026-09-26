import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { CheckCircle2, Columns3, Download, Printer, ReceiptText, Search, SearchX } from "lucide-react";
import { apiFetch, downloadFile } from "@/lib/api.js";
import { formatDateTime, formatMoney, formatShortDate, formatTime } from "@/lib/format.js";
import { useSort } from "@/lib/useSort.js";
import { Badge, BarList, Button, DataTable, EmptyState, Input, SegmentedControl, Select, TableSkeleton, Td, Tf, Th, Tr } from "@/ui/index.js";
import InvoiceModal from "@/modules/invoices/components/InvoiceModal.jsx";
import { statusesKey } from "@/modules/common/constants.js";
import { REPORTS_BOOKINGS_QUERY_KEY } from "@/modules/reports/constants.js";
import {
  REPORT_TABLE_MAX_HEIGHT,
  InfoTip,
  KpiCard,
  KpiGrid,
  Pager,
  ReportLoadState,
  ReportPanel,
  Refetching,
} from "@/modules/reports/components/reportParts.jsx";

const COUNT_BY = [
  { value: "checkIn", label: "Check-in date" },
  { value: "checkOut", label: "Check-out date" },
];

const COLUMNS_STORAGE_KEY = "sln:reports:bookingColumns";

const money = (v) => (v != null ? formatMoney(v) : "—");

function Muted({ children, className = "", ...props }) {
  return (
    <p className={`truncate text-xs text-ink-muted ${className}`} {...props}>
      {children}
    </p>
  );
}

function Stamp({ scheduled, actual, by }) {
  return (
    <>
      <p className="whitespace-nowrap">{formatDateTime(scheduled)}</p>
      {actual && (
        <p
          className="flex items-center gap-1 whitespace-nowrap text-xs text-success"
          title={`Actual ${formatDateTime(actual)}${by ? ` by ${by}` : ""}`}
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-label="Actual" />
          <span className="truncate">
            {formatShortDate(actual)}, {formatTime(actual)}
            {by ? ` · ${by}` : ""}
          </span>
        </p>
      )}
    </>
  );
}

function Notes({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return <span className="text-ink-faint">—</span>;
  const long = text.length > 70 || text.includes("\n");
  return (
    <div>
      <p className={`whitespace-pre-line break-words text-xs text-ink-soft ${open ? "" : "line-clamp-2"}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 text-xs font-medium text-brand hover:underline print:hidden">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

// Every column of the Bookings table in one place: its width (the table is
// laid out at exactly these widths, so nothing gets squeezed), what it
// shows, its share of the totals row, and whether it can be hidden.
// Related fields share a cell — guest/phone/GSTIN, room/type, booked vs
// actual times with who did it — so the table stays readable at ~16
// columns instead of 27.
function buildColumns({ onReprint }) {
  return [
    { id: "sl", label: "#", width: 48, fixed: true, render: (r, i) => <span className="tabular-nums text-ink-muted">{i}</span> },
    {
      id: "invoice",
      label: "Invoice",
      width: 150,
      sortKey: "invoiceNumber",
      render: (r) =>
        r.invoiceNumber ? (
          <>
            <p className="whitespace-nowrap font-medium text-ink">{r.invoiceNumber}</p>
            <button
              type="button"
              onClick={() => onReprint(r.id)}
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline print:hidden"
            >
              <Printer className="h-3 w-3" />
              Reprint
            </button>
          </>
        ) : (
          <Muted>{r.status.code === "cancelled" ? "Not billed" : "At checkout"}</Muted>
        ),
    },
    {
      id: "guest",
      label: "Guest",
      width: 220,
      fixed: true,
      pinned: true,
      sortKey: "guest",
      render: (r) => (
        <>
          <p className="truncate font-medium text-ink" title={r.guest.name}>
            {r.guest.name}
          </p>
          {r.guest.phone && <Muted>{r.guest.phone}</Muted>}
          {r.guest.gstin && (
            <Muted className="font-mono" title={r.guest.companyName ?? undefined}>
              GSTIN {r.guest.gstin}
            </Muted>
          )}
        </>
      ),
      footer: (data) => `Totals · ${data.total} room booking${data.total === 1 ? "" : "s"}`,
    },
    {
      id: "room",
      label: "Room",
      width: 130,
      sortKey: "room",
      render: (r) => (
        <>
          <p className="font-medium text-ink">{r.room}</p>
          <Muted>{r.roomType}</Muted>
        </>
      ),
    },
    {
      id: "status",
      label: "Status",
      width: 150,
      render: (r) => (
        <>
          <Badge color={r.status.color}>{r.status.label}</Badge>
          <Muted className="mt-1">{r.cancelledBy ? `Cancelled by ${r.cancelledBy}` : r.bookedBy ? `Booked by ${r.bookedBy}` : ""}</Muted>
        </>
      ),
    },
    {
      id: "checkIn",
      label: "Check-in",
      width: 190,
      sortKey: "checkIn",
      render: (r) => <Stamp scheduled={r.checkIn} actual={r.actualCheckIn} by={r.checkedInBy} />,
    },
    {
      id: "checkOut",
      label: "Check-out",
      width: 190,
      sortKey: "checkOut",
      render: (r) => <Stamp scheduled={r.checkOut} actual={r.actualCheckOut} by={r.checkedOutBy} />,
    },
    { id: "nights", label: "Nights", width: 72, align: "right", render: (r) => <span className="tabular-nums">{r.nights}</span> },
    {
      id: "taxable",
      label: "Taxable value",
      width: 130,
      align: "right",
      sortKey: "taxableValue",
      render: (r) => money(r.taxableValue),
      footer: (data) => money(data.totals.taxableValue),
    },
    {
      id: "gst",
      label: "CGST / SGST",
      width: 140,
      align: "right",
      render: (r) =>
        r.cgst != null ? (
          <>
            <p className="whitespace-nowrap">
              <span className="text-xs text-ink-muted">C </span>
              {money(r.cgst)}
            </p>
            <p className="whitespace-nowrap">
              <span className="text-xs text-ink-muted">S </span>
              {money(r.sgst)}
            </p>
          </>
        ) : (
          "—"
        ),
      footer: (data) => (
        <>
          <p className="whitespace-nowrap">C {money(data.totals.cgst)}</p>
          <p className="whitespace-nowrap">S {money(data.totals.sgst)}</p>
        </>
      ),
    },
    {
      id: "discount",
      label: "Discount",
      width: 120,
      align: "right",
      sortKey: "discount",
      render: (r) => (r.discount != null ? `− ${formatMoney(r.discount)}` : "—"),
      footer: (data) => (data.totals.discount ? `− ${formatMoney(data.totals.discount)}` : "—"),
    },
    {
      id: "other",
      label: "Other charges",
      width: 130,
      align: "right",
      render: (r) => money(r.otherCharges),
      footer: (data) => money(data.totals.otherCharges),
    },
    {
      id: "total",
      label: "Total",
      width: 140,
      align: "right",
      sortKey: "total",
      render: (r) => (
        <>
          <p className="whitespace-nowrap font-semibold text-ink">{money(r.total)}</p>
          {r.otherCharges != null && r.grandTotal != null && <Muted>Rooms {formatMoney(r.grandTotal)}</Muted>}
        </>
      ),
      footer: (data) => money(data.totals.total),
    },
    {
      id: "paid",
      label: "Paid",
      width: 140,
      align: "right",
      render: (r) => (
        <>
          <p className="whitespace-nowrap">{money(r.advance)}</p>
          {r.refunded != null && <Muted>Refunded {formatMoney(r.refunded)}</Muted>}
          {r.retained != null && <Muted className="!text-warning">Retained on cancel</Muted>}
        </>
      ),
      footer: (data) => (
        <>
          <p className="whitespace-nowrap">{money(data.totals.paid)}</p>
          {data.totals.refunded > 0 && <p className="text-xs font-normal text-ink-muted">Refunded {formatMoney(data.totals.refunded)}</p>}
        </>
      ),
    },
    {
      id: "paidVia",
      label: "Paid via",
      width: 150,
      render: (r) =>
        r.paymentMethods.length ? <p className="text-xs text-ink-soft">{r.paymentMethods.join(", ")}</p> : <span className="text-ink-faint">—</span>,
    },
    { id: "notes", label: "Notes", width: 260, render: (r) => <Notes text={r.notes} /> },
  ];
}

function readHiddenColumns() {
  try {
    const raw = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

// Show/hide columns — remembered per browser (a personal preference,
// not tenant data).
function ColumnsMenu({ columns, hidden, onChange }) {
  const toggle = (id) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // storage unavailable (private mode) — the choice just won't persist
    }
    onChange(next);
  };
  const hideable = columns.filter((c) => !c.fixed);
  return (
    <Popover className="relative">
      <PopoverButton className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink-soft hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring">
        <Columns3 className="h-4 w-4" />
        Columns{hidden.size ? ` (${hideable.length - hidden.size}/${hideable.length})` : ""}
      </PopoverButton>
      <PopoverPanel anchor="bottom end" className="z-40 mt-1 w-56 rounded-lg border border-line bg-card p-2 shadow-lg">
        {hideable.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink-soft hover:bg-muted">
            <input type="checkbox" className="accent-brand" checked={!hidden.has(c.id)} onChange={() => toggle(c.id)} />
            {c.label}
          </label>
        ))}
        {hidden.size > 0 && (
          <button
            type="button"
            onClick={() => [...hidden].forEach(toggle)}
            className="mt-1 w-full rounded px-2 py-1.5 text-left text-xs font-medium text-brand hover:bg-muted"
          >
            Show all columns
          </button>
        )}
      </PopoverPanel>
    </Popover>
  );
}

export default function BookingsReport({ from, to }) {
  const [countBy, setCountBy] = useState("checkIn");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("50");
  const [hidden, setHidden] = useState(readHiddenColumns);
  const [invoiceBookingId, setInvoiceBookingId] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const sort = useSort();

  useEffect(() => setPage(1), [from, to, statusFilter, search, countBy, pageSize, sort.sortBy, sort.sortDir]);

  const { data: statuses } = useQuery({ queryKey: statusesKey("booking"), queryFn: () => apiFetch("/statuses?domain=booking") });
  const statusOptions = [{ value: "", label: "All statuses" }, ...(statuses ?? []).map((s) => ({ value: s.code, label: s.label }))];

  const filters = {
    from,
    to,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(search ? { search } : {}),
    checkoutBasis: String(countBy === "checkOut"),
  };

  const query = useQuery({
    queryKey: [REPORTS_BOOKINGS_QUERY_KEY, filters, page, pageSize, sort.sortBy, sort.sortDir],
    queryFn: () =>
      apiFetch(
        `/reports/bookings?${new URLSearchParams({
          ...filters,
          page: String(page),
          pageSize,
          ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}),
        })}`,
      ),
    placeholderData: (prev) => prev,
  });
  const { data } = query;

  const columns = useMemo(() => buildColumns({ onReprint: setInvoiceBookingId }), []);
  const visible = columns.filter((c) => !hidden.has(c.id));
  const tableWidth = visible.reduce((sum, c) => sum + c.width, 0);

  async function downloadCsv() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadFile(`/reports/bookings.csv?${new URLSearchParams(filters)}`, `room-bookings-${from}-to-${to}.csv`);
    } catch (err) {
      setDownloadError(`Couldn't download the CSV — ${err.message}`);
    } finally {
      setDownloading(false);
    }
  }

  if (data === undefined) return <ReportLoadState query={query} title="Couldn't load the bookings report" cards={6} />;

  const counts = data.counts;
  return (
    <Refetching active={query.isFetching && query.isPlaceholderData}>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-sm text-ink-muted">Count bookings by</span>
        <SegmentedControl size="sm" options={COUNT_BY} value={countBy} onChange={setCountBy} />
        <InfoTip label="What's counted">
          <p>
            <strong>Check-in date</strong>: every booking arriving in this period, whatever its status.
          </p>
          <p>
            <strong>Check-out date</strong>: only completed (checked-out) stays, by the day they left — the same stays the Revenue and GST tabs are
            billed from.
          </p>
        </InfoTip>
      </div>

      <KpiGrid columns={6}>
        <KpiCard label="Stays" value={counts.bookings} sub="A group booking counts once" />
        <KpiCard label="Room bookings" value={counts.totalRooms} sub="Each room of a group counts" />
        <KpiCard label="Room-nights" value={counts.roomNights} sub="Excludes cancelled & no-shows" />
        <KpiCard label="Average stay" value={counts.avgStayNights} sub={`night${counts.avgStayNights === 1 ? "" : "s"} per room booking`} />
        <KpiCard label="Cancelled" value={counts.cancelled} />
        <KpiCard label="No-shows" value={counts.noShows} />
      </KpiGrid>

      <div className="mb-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ReportPanel title="By status">
          <BarList
            items={data.byStatus.map((s) => ({ key: s.code, label: s.label, value: s.count, display: `${s.count} · ${s.percent}%`, color: s.color }))}
          />
        </ReportPanel>
        <ReportPanel title="By room type">
          <BarList
            items={data.byRoomType.map((rt) => ({ key: rt.name, label: rt.name, value: rt.count, display: `${rt.count} · ${rt.percent}%` }))}
          />
        </ReportPanel>
      </div>

      <ReportPanel
        title="Booking details"
        subtitle="Totals at the bottom cover every row in this period, not just this page."
        actions={
          <>
            <InfoTip label="How totals work">
              <p>Room rates include GST, so a discount comes off the inclusive price first: Taxable value + CGST + SGST = rooms total.</p>
              <p>Total = rooms total + other charges (food, damages…), which may carry their own GST rate.</p>
              <p>Tax figures appear once a stay is checked out — tax is only finalized at checkout, so earlier rows show "—".</p>
              <p>Paid is net of refunds.</p>
            </InfoTip>
            <Button variant="outline" size="sm" onClick={downloadCsv} loading={downloading}>
              {!downloading && <Download className="h-4 w-4" />}
              Download CSV
            </Button>
          </>
        }
      >
        {downloadError && <div className="mb-3 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{downloadError}</div>}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64">
              <Input
                icon={Search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Guest name, phone or room"
                aria-label="Search"
              />
            </div>
            <div className="w-44">
              <Select options={statusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" />
            </div>
            <ColumnsMenu columns={columns} hidden={hidden} onChange={setHidden} />
          </div>
          <Pager page={data.page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={setPageSize} />
        </div>

        {query.isFetching && data.rows.length === 0 && <TableSkeleton rows={6} columns={8} />}

        {data.rows.length === 0 &&
          !query.isFetching &&
          (search || statusFilter ? (
            <EmptyState
              icon={SearchX}
              title="No bookings match these filters"
              subtitle="Try another search or status, or pick a longer period."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={ReceiptText} title="No bookings in this period" subtitle="Try the previous period, or a longer one (Month or Year)." />
          ))}

        {data.rows.length > 0 && (
          <DataTable fixed minWidth={`${tableWidth}px`} maxHeight={REPORT_TABLE_MAX_HEIGHT}>
            <colgroup>
              {visible.map((c) => (
                <col key={c.id} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {visible.map((c) => (
                  <Th key={c.id} align={c.align} pinned={c.pinned} {...(c.sortKey ? sort.headerProps(c.sortKey) : {})}>
                    {c.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <Tr key={r.id} className="align-top">
                  {visible.map((c) => (
                    <Td key={c.id} align={c.align} pinned={c.pinned} className="tabular-nums">
                      {c.render(r, (data.page - 1) * data.pageSize + i + 1)}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="align-top">
                {visible.map((c) => (
                  <Tf key={c.id} align={c.align} pinned={c.pinned} className="tabular-nums">
                    {c.footer?.(data) ?? ""}
                  </Tf>
                ))}
              </tr>
            </tfoot>
          </DataTable>
        )}
      </ReportPanel>

      {invoiceBookingId && <InvoiceModal bookingId={invoiceBookingId} autoGenerate={false} onClose={() => setInvoiceBookingId(null)} />}
    </Refetching>
  );
}
