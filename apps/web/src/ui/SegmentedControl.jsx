// A config-driven view switcher (Day/Week/Month/Custom, etc.) — `options`
// is always caller-supplied, never a hardcoded set baked into this file.
export default function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded px-3 py-1.5 text-sm font-medium capitalize transition ${
            value === option.value ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {option.label ?? option.value}
        </button>
      ))}
    </div>
  );
}
