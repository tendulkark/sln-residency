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

export function Th({ children, align = "left", pinned = false, className = "" }) {
  return (
    <th
      scope="col"
      className={`${HEADER_CLASSES} ${align === "right" ? "text-right" : "text-left"} ${
        pinned ? "left-0 z-30 border-r border-line print:static print:border-r-0" : ""
      } ${className}`}
    >
      {children}
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

// `tr` needs the `group` class for the cell-level zebra/hover to key off it
// — DataTable.Row is that, so callers don't have to remember.
export function Tr({ className = "", ...props }) {
  return <tr className={`group ${className}`} {...props} />;
}

// Two sizing modes:
// - default: capped at `maxHeight` — for a table that shares the page with
//   other content above it (Reports' stat cards/charts), where the page
//   still scrolls and the table just shouldn't run away with it.
// - `fill`: grows to whatever height is left in a flex-column parent
//   (`flex h-full flex-col` on the page root) — for a page that is
//   basically just the table (Invoices), so it uses the whole screen and
//   the page itself never scrolls.
export default function DataTable({ children, maxHeight = "65vh", fill = false, minWidth, className = "" }) {
  return (
    <div
      className={`overflow-auto overscroll-contain rounded-lg border border-line-strong bg-card shadow-sm print:max-h-none print:overflow-visible ${
        fill ? "min-h-0 flex-1" : ""
      } ${className}`}
      style={fill ? undefined : { maxHeight }}
    >
      <table className="w-full border-separate border-spacing-0 text-left text-sm" style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}
