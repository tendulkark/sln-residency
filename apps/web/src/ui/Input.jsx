const FIELD_CLASSES =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default function Input({ label, error, icon: Icon, className = "", id, ...props }) {
  const fieldId = id ?? props.name;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />}
        <input
          id={fieldId}
          className={`${FIELD_CLASSES} ${Icon ? "pl-9" : ""} ${error ? "border-red-300 focus:border-red-400 focus:ring-red-300" : ""} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
