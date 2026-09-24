// A config-driven view switcher (Day/Week/Month/Custom, etc.) — `options`
// is always caller-supplied, never a hardcoded set baked into this file.
// `fullWidth` stretches it to its container with equal-width segments.
export default function SegmentedControl({ options, value, onChange, fullWidth = false, size = "md" }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div className={`${fullWidth ? "flex w-full" : "inline-flex"} rounded-md border border-line-strong bg-card p-0.5`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`${fullWidth ? "min-w-0 flex-1 truncate" : ""} rounded ${pad} font-medium capitalize transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ${
            value === option.value ? "bg-brand text-white" : "text-ink-soft hover:bg-muted-strong"
          }`}
        >
          {option.label ?? option.value}
        </button>
      ))}
    </div>
  );
}
