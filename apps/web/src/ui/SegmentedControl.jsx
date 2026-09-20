// A config-driven view switcher (Day/Week/Month/Custom, etc.) — `options`
// is always caller-supplied, never a hardcoded set baked into this file.
export default function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-md border border-line-strong bg-card p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded px-3 py-1.5 text-sm font-medium capitalize transition ${
            value === option.value ? "bg-brand text-white" : "text-ink-soft hover:bg-muted-strong"
          }`}
        >
          {option.label ?? option.value}
        </button>
      ))}
    </div>
  );
}
