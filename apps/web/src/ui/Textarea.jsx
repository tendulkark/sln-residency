const FIELD_CLASSES =
  "w-full rounded-md border border-line-strong bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default function Textarea({ label, error, className = "", id, ...props }) {
  const fieldId = id ?? props.name;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      <textarea id={fieldId} className={`${FIELD_CLASSES} ${error ? "border-danger/40 focus:border-danger/60 focus:ring-danger/40" : ""} ${className}`} {...props} />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
