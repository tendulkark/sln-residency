const FIELD_CLASSES =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default function Textarea({ label, error, className = "", id, ...props }) {
  const fieldId = id ?? props.name;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <textarea id={fieldId} className={`${FIELD_CLASSES} ${error ? "border-red-300 focus:border-red-400 focus:ring-red-300" : ""} ${className}`} {...props} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
