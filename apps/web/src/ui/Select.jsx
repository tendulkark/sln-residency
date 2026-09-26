import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

// Native-<select>-like API on top of Headless UI's Listbox, so every
// dropdown in the app looks and behaves the same and is themeable from one
// place. `options` is always the caller's own data — nothing here is ever
// a hardcoded list (AI_RULES.md #1).
// `loading` is for options that come from the server: the field shows
// "Loading…" and can't be opened until they arrive. `emptyText` is what the
// open list says when there's genuinely nothing to pick.
export default function Select({ label, options, value, onChange, placeholder = "Select…", disabled, error, loading = false, emptyText = "No options" }) {
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <div className="space-y-1">
      {label && <span className="block text-sm font-medium text-ink-soft">{label}</span>}
      <Listbox value={value ?? ""} onChange={onChange} disabled={disabled || loading}>
        <div className="relative">
          <ListboxButton
            className={`relative w-full rounded-md border bg-card py-2 pl-3 pr-9 text-left text-sm focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 ${
              error ? "border-danger/40" : "border-line-strong"
            }`}
          >
            <span className={selected ? "text-ink" : "text-ink-faint"}>{loading ? "Loading…" : selected ? selected.label : placeholder}</span>
            {loading ? (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-faint" />
            ) : (
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            )}
          </ListboxButton>
          {/* Anchored (rendered in a floating layer above the page, flipping
              upward when there's no room below) rather than positioned inside
              the field's own box — so a sticky table header, a card or a
              scroll container can never paint over the open list or clip it. */}
          <ListboxOptions
            anchor="bottom start"
            transition
            className="z-[60] max-h-60 w-[var(--button-width)] overflow-auto rounded-md border border-line bg-card py-1 text-sm shadow-lg [--anchor-gap:4px] focus:outline-none transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0"
          >
            {options.length === 0 && <div className="px-3 py-2 text-ink-muted">{emptyText}</div>}
            {options.map((option) => (
              <ListboxOption
                key={option.value}
                value={option.value}
                className="relative cursor-pointer select-none px-3 py-2 pl-9 text-ink data-[focus]:bg-brand-tint"
              >
                {({ selected: isSelected }) => (
                  <>
                    {isSelected && <Check className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />}
                    {option.label}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
