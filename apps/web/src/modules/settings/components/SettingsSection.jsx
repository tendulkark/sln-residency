// The heading each Settings tab opens with (the hub's own PageHeader sits
// above the tabs), plus optional actions on the right.
export default function SettingsSection({ title, subtitle, actions }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 max-w-2xl text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
