// A toggleable filter pill (floor/status filters on the Dashboard) —
// distinct from Badge, which is a static display-only label.
export default function Chip({ active, onClick, children, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? "border-brand bg-brand text-white" : "border-line-strong bg-card text-gray-700 hover:bg-muted"
      }`}
    >
      {children}
      {count != null && <span className={`ml-1 ${active ? "text-white/80" : "text-gray-400"}`}>{count}</span>}
    </button>
  );
}
