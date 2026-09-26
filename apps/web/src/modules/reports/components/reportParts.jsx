import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Button, Card, CardSkeleton, ErrorState, Select, Skeleton } from "@/ui/index.js";

// Small building blocks every Reports tab shares, so the four tabs read as
// one report rather than four screens that happen to sit together.

// % change from `previous` to `current`, or null when there's nothing to
// compare against (a zero previous period has no meaningful percentage).
export function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

// A headline figure. `delta` (a % from percentChange) shows as a ▲/▼ chip
// against the previous period; green means "better", so pass
// `upIsGood={false}` for a figure where growth is bad (refunds).
export function KpiCard({ label, value, sub, delta, upIsGood = true, deltaLabel = "vs previous period", loading = false }) {
  const better = delta != null && delta !== 0 && delta > 0 === upIsGood;
  const Arrow = delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wider text-brand/75">{label}</p>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-7 w-24" />
          <Skeleton className="mt-2 h-3 w-32" />
        </>
      ) : (
        <>
          <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-ink" title={typeof value === "string" ? value : undefined}>
            {value}
          </p>
          {delta != null && (
            <p className="mt-1 flex items-center gap-1 text-xs">
              <span className={`inline-flex items-center gap-0.5 font-semibold ${delta === 0 ? "text-ink-muted" : better ? "text-success" : "text-danger"}`}>
                {delta !== 0 && <Arrow className="h-3.5 w-3.5" aria-hidden="true" />}
                {delta > 0 ? "+" : ""}
                {delta}%
              </span>
              <span className="text-ink-muted">{deltaLabel}</span>
            </p>
          )}
          {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
        </>
      )}
    </Card>
  );
}

// Full class names (not built from a number) so Tailwind generates them.
// Wide rows step down through 3-across on mid-size screens rather than
// squeezing five or six cards into a laptop-width content area.
const KPI_COLUMNS = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-3 2xl:grid-cols-5",
  6: "lg:grid-cols-3 2xl:grid-cols-6",
};

export function KpiGrid({ columns = 4, children }) {
  return <div className={`mb-4 grid grid-cols-2 gap-3 sm:gap-4 ${KPI_COLUMNS[columns] ?? KPI_COLUMNS[4]}`}>{children}</div>;
}

// A titled section of a report (a chart, a breakdown, a table).
export function ReportPanel({ title, subtitle, actions, children, className = "" }) {
  return (
    <Card className={`min-w-0 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <p className="text-xs font-bold uppercase tracking-wider text-brand/75">{title}</p>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
        </div>
      )}
      {children}
    </Card>
  );
}

// An ⓘ that opens a short explanation — for "how is this worked out"
// notes that used to sit on the page as paragraphs of small print.
export function InfoTip({ label = "How this is worked out", children }) {
  return (
    <Popover className="relative inline-flex print:hidden">
      <PopoverButton className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-ink-muted hover:bg-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring">
        <Info className="h-3.5 w-3.5" />
        {label}
      </PopoverButton>
      <PopoverPanel anchor="bottom end" className="z-40 mt-1 w-80 max-w-[90vw] space-y-2 rounded-lg border border-line bg-card p-3 text-xs leading-relaxed text-ink-soft shadow-lg">
        {children}
      </PopoverPanel>
    </Popover>
  );
}

const PAGE_SIZES = [
  { value: "25", label: "25 / page" },
  { value: "50", label: "50 / page" },
  { value: "100", label: "100 / page" },
];

export function Pager({ page, pageSize, total, onPage, onPageSize }) {
  const totalPages = Math.max(1, Math.ceil(total / Number(pageSize)));
  return (
    <div className="flex items-center gap-2 print:hidden">
      <div className="w-32">
        <Select options={PAGE_SIZES} value={pageSize} onChange={onPageSize} />
      </div>
      <Button variant="outline" size="sm" aria-label="Previous page" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <p className="whitespace-nowrap text-sm tabular-nums text-ink-muted">
        {page} / {totalPages} · {total} rows
      </p>
      <Button variant="outline" size="sm" aria-label="Next page" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// First-load placeholder and load-failure state for a tab. Later period
// changes keep the previous figures on screen (faded) while the new ones
// load, so the page never jumps back to skeletons.
export function ReportLoadState({ query, title, cards = 4 }) {
  if (query.data !== undefined) return null;
  if (query.isError) return <ErrorState title={title} error={query.error} onRetry={() => query.refetch()} />;
  return (
    <div role="status" aria-label="Loading report">
      <KpiGrid columns={cards}>
        <CardSkeleton count={cards} />
      </KpiGrid>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

// Wraps a tab's content so a refetch (a new period) dims the old numbers
// instead of flashing — and says so to screen readers.
export function Refetching({ active, children }) {
  return (
    <div aria-busy={active || undefined} className={`transition-opacity ${active ? "opacity-60" : ""}`}>
      {children}
    </div>
  );
}
