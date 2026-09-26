// A ranked horizontal-bar breakdown — "how much of the whole is each
// part" (bookings by status, collections by payment method). Easier to
// compare than a donut, and every label and value stays readable text
// instead of being squeezed into a legend.
//
// `items = [{ key, label, value, display?, sub?, color? }]`: `value` sizes
// the bar (relative to the largest), `display` is the text shown for it
// (defaults to value), `sub` is an optional muted second line, and `color`
// is an entity's own color where it has one (a tenant's Status color) —
// otherwise the brand color. Text never takes the bar's color.
export default function BarList({ items, emptyText = "Nothing to show for this range." }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="py-2 text-sm text-ink-muted">{emptyText}</p>;

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key ?? item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 text-ink-soft">
              {item.color && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
              <span className="truncate" title={item.label}>
                {item.label}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{item.display ?? item.value}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted-strong">
            <div
              className="h-full rounded-full"
              style={{ width: `${max > 0 ? Math.max(0, (item.value / max) * 100) : 0}%`, backgroundColor: item.color ?? "var(--color-brand)" }}
            />
          </div>
          {item.sub && <p className="mt-0.5 text-xs text-ink-muted">{item.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
