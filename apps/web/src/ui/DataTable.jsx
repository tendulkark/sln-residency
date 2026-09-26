import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";

// The one shell every data table in the app (Invoices list, Reports >
// Bookings, Reports > GST) renders through.
//
// Three things it settles once, instead of per page:
//
// 1. The table scrolls *inside* a height-capped box, not with the page —
//    filters, pagination and the page header stay put while the rows
//    scroll, and a wide report scrolls sideways within the same box. On a
//    phone that's the difference between "the header is three screens up"
//    and always knowing which column you're reading.
// 2. Header cells stick to the top of that box (`sticky top-0` on each
//    <th>, not on <thead> — Safari only honours it on the cell). Sticky
//    cells lose their borders under `border-collapse`, so the table uses
//    border-separate and every cell draws its own bottom rule instead.
// 3. An optional pinned column (`pinned` on a Th/Td pair) stays at the
//    left edge while the rest scrolls sideways — the row's identity
//    (invoice number, guest name) is always in view. Pinned cells must
//    paint an opaque background to cover what slides beneath them, so
//    zebra/hover fills live on the cells (via `group-*` off the row), using
//    the solid --color-zebra token rather than a translucent tint.
//
// Everything is print-neutral: the cap and stickiness are dropped under
// print so a report still prints in full (ReportsPage wraps its tabs in a
// data-print-area for exactly that).

const HEADER_CLASSES = "sticky top-0 z-20 border-b border-line-strong bg-muted px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-brand/75 print:static";

// Pass `sortDir` ("asc" | "desc" | undefined) + `onSort` to make a header
// cell clickable and sortable — see `useSort` in lib/useSort.js, which
// pages use to track which column/direction is active and toggle it. A Th
// with no `onSort` renders exactly as before (most columns, e.g. Notes/
// Status, aren't sortable). The arrow/placeholder icon sits print:hidden
// since a printed report has no interaction anyway.
export function Th({ children, align = "left", pinned = false, className = "", sortDir, onSort }) {
  const sortable = typeof onSort === "function";
  return (
    <th
      scope="col"
      aria-sort={sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : sortable ? "none" : undefined}
      className={`${HEADER_CLASSES} ${align === "right" ? "text-right" : "text-left"} ${
        pinned ? "left-0 z-30 border-r border-line print:static print:border-r-0" : ""
      } ${sortable ? "cursor-pointer select-none hover:text-brand" : ""} ${className}`}
      onClick={sortable ? onSort : undefined}
      onKeyDown={
        sortable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSort();
              }
            }
          : undefined
      }
      tabIndex={sortable ? 0 : undefined}
      role={sortable ? "button" : undefined}
    >
      {sortable ? (
        <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
          {children}
          {sortDir === "asc" && <ArrowUp className="h-3 w-3 print:hidden" />}
          {sortDir === "desc" && <ArrowDown className="h-3 w-3 print:hidden" />}
          {!sortDir && <ChevronsUpDown className="h-3 w-3 opacity-40 print:hidden" />}
        </span>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({ children, align = "left", pinned = false, className = "" }) {
  return (
    <td
      className={`border-b border-line-soft px-3 py-2 group-odd:bg-zebra group-hover:bg-brand-tint ${
        align === "right" ? "text-right" : "text-left"
      } ${pinned ? "sticky left-0 z-10 border-r border-line bg-card print:static print:border-r-0" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

// A totals-row cell (inside <tfoot>): sticks to the bottom of the scroll
// box the way headers stick to the top, so a range's totals stay in view
// while the rows scroll. Opaque, like pinned cells, for the same reason.
export function Tf({ children, align = "left", pinned = false, className = "" }) {
  return (
    <td
      className={`sticky bottom-0 z-20 border-t border-line-strong bg-muted px-3 py-2 font-semibold text-ink print:static ${
        align === "right" ? "text-right" : "text-left"
      } ${pinned ? "left-0 z-30 border-r border-line print:border-r-0" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

// `tr` needs the `group` class for the cell-level zebra/hover to key off it
// — DataTable.Row is that, so callers don't have to remember.
export function Tr({ className = "", ...props }) {
  return <tr className={`group ${className}`} {...props} />;
}

// Two sizing modes:
// - default: capped at `maxHeight` — for a table that shares the page with
//   other content above it (Reports' stat cards/charts), where the page
//   still scrolls and the table just shouldn't run away with it.
// Pass `fixed` with a <colgroup> of widths to lay columns out at exactly
// those widths (table-layout: fixed) — a wide report then never squeezes
// one column (Notes) to make room for the rest.
//
// - `fill`: grows to whatever height is left in a flex-column parent
//   (`flex h-full flex-col` on the page root) — for a page that is
//   basically just the table (Invoices), so it uses the whole screen and
//   the page itself never scrolls.
export default function DataTable({ children, maxHeight = "65vh", fill = false, fixed = false, minWidth, className = "" }) {
  return (
    <div
      // `isolate` keeps the sticky header/pinned cells' z-indexes inside
      // this box, so they can't paint over page chrome (a sticky page
      // header) as the page scrolls.
      className={`isolate overflow-auto overscroll-contain rounded-lg border border-line-strong bg-card shadow-sm print:max-h-none print:overflow-visible ${
        fill ? "min-h-0 flex-1" : ""
      } ${className}`}
      style={fill ? undefined : { maxHeight }}
    >
      <table className={`w-full border-separate border-spacing-0 text-left text-sm ${fixed ? "table-fixed" : ""}`} style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}
