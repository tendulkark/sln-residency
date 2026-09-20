// A dependency-free donut chart (plain SVG stroke-dasharray segments) with
// a legend — `data = [{ label, value, color }]`. Every segment's color is
// caller-supplied (e.g. a tenant's own Status.color, or a small UI-only
// palette for computed buckets), never hardcoded here.
export default function DonutChart({ data, size = 140, thickness = 22 }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let cursor = 0;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const dash = (d.value / total) * circumference;
      const segment = { ...d, dash, offset: cursor };
      cursor += dash;
      return segment;
    });

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-line)" strokeWidth={thickness} />
        {segments.map((s) => (
          <circle
            key={s.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {data.length === 0 && <p className="text-sm text-ink-muted">No data for this range.</p>}
        {data.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-ink-soft">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="shrink-0 text-ink-muted">
              {d.value} · {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
