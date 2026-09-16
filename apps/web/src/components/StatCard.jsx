export default function StatCard({ label, value, sublabel, badge, tone = "neutral" }) {
  const toneClasses = {
    neutral: "bg-white",
    warn: "bg-rose-50",
  };

  return (
    <div className={`rounded-xl border border-gray-200 p-4 shadow-sm ${toneClasses[tone] ?? toneClasses.neutral}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
        {badge && <span className="text-xs font-medium text-emerald-600">{badge}</span>}
      </div>
      {sublabel && <div className="mt-1 text-xs text-gray-500">{sublabel}</div>}
    </div>
  );
}
