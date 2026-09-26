const FIELD_CLASSES =
  "w-full rounded-md border border-line-strong bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-muted";

export default function Input({ label, error, icon: Icon, className = "", id, ...props }) {
  const fieldId = id ?? props.name;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />}
        <input
          id={fieldId}
          className={`${FIELD_CLASSES} ${Icon ? "pl-9" : ""} ${error ? "border-danger/40 focus:border-danger/60 focus:ring-danger/40" : ""} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
