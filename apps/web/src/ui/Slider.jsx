import { Minus, Plus } from "lucide-react";

// A labelled range input with −/+ step buttons for exact values (and easier
// use on touch screens). `format` turns the value into the text shown at
// the right of the label (e.g. v => `${v}%`); `action` sits beside it.
export default function Slider({ label, value, onChange, min, max, step = 1, format = String, id, action }) {
  const pct = ((value - min) / (max - min)) * 100;
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const stepButton = "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line-strong bg-card text-ink-soft transition hover:bg-muted-strong disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink-soft">
          {label}
        </label>
        <span className="flex items-center gap-2">
          {action}
          <span className="min-w-11 rounded bg-muted px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-ink">{format(value)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Decrease ${label}`} className={stepButton} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="ui-range min-w-0 flex-1"
          style={{ "--range-pct": `${pct}%` }}
        />
        <button type="button" aria-label={`Increase ${label}`} className={stepButton} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
