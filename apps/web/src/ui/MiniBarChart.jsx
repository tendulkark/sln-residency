// A small dependency-free bar chart for a daily trend (revenue, occupancy).
// `data = [{ label, value }]`; `format` controls the hover tooltip text.
export default function MiniBarChart({ data, format = (v) => v, height = 128 }) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="text-sm text-gray-400">No data for this range.</p>;
  }

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d) => (
        <div
          key={d.label}
          className="min-w-[3px] flex-1 rounded-t bg-brand transition-colors hover:bg-brand-dark"
          style={{ height: `${Math.max(2, (d.value / max) * height)}px` }}
          title={`${d.label}: ${format(d.value)}`}
        />
      ))}
    </div>
  );
}
