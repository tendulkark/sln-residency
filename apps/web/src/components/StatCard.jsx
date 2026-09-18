import Card from "../ui/Card.jsx";

const TONE_CLASSES = {
  neutral: { card: "", iconWrap: "bg-brand-tint text-brand" },
  warn: { card: "bg-rose-50 border-rose-100", iconWrap: "bg-rose-100 text-rose-600" },
};

export default function StatCard({ label, value, sublabel, badge, icon: Icon, tone = "neutral" }) {
  const toneClasses = TONE_CLASSES[tone] ?? TONE_CLASSES.neutral;

  return (
    <Card className={toneClasses.card}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        {Icon && (
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${toneClasses.iconWrap}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums tracking-tight text-gray-900">{value}</span>
        {badge && <span className="text-xs font-semibold text-emerald-600">{badge}</span>}
      </div>
      {sublabel && <div className="mt-1 text-xs text-gray-500">{sublabel}</div>}
    </Card>
  );
}
