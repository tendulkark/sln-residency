// `compact` is for modals and small panels.
export default function EmptyState({ icon: Icon, title, subtitle, action, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${compact ? "py-6" : "py-16"}`}>
      {Icon && (
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      {action}
    </div>
  );
}
