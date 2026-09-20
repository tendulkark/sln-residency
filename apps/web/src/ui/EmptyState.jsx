export default function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
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
