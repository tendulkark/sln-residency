import {
  Combobox as HeadlessCombobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Transition,
} from "@headlessui/react";
import { Fragment } from "react";

// A search-or-create typeahead: `query` is the raw text the caller owns
// (used to create a new record when nothing is selected), `options` are the
// matches to pick from instead. Used for the guest lookup in
// BookingFormModal, but generic enough for any "find or create" field.
// `loading` shows "Searching…" in the list while matches are on their way,
// instead of briefly (and wrongly) claiming there are none.
export default function Combobox({ label, query, onQueryChange, options, onSelect, placeholder, createLabel, loading = false }) {
  return (
    <div className="space-y-1">
      {label && <span className="block text-sm font-medium text-ink-soft">{label}</span>}
      <HeadlessCombobox value={null} onChange={(value) => value && onSelect(value)}>
        <div className="relative">
          <ComboboxInput
            className="w-full rounded-md border border-line-strong bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            displayValue={() => query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
          <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-line bg-card py-1 text-sm shadow-lg focus:outline-none">
              {loading ? (
                <div className="px-3 py-2 text-ink-muted">Searching…</div>
              ) : options.length === 0 ? (
                <div className="px-3 py-2 text-ink-muted">{createLabel ?? "No matches — a new record will be created"}</div>
              ) : (
                options.map((option) => (
                  <ComboboxOption
                    key={option.value}
                    value={option}
                    className="cursor-pointer select-none px-3 py-2 text-ink data-[focus]:bg-brand-tint"
                  >
                    {option.label}
                    {option.subLabel && <span className="ml-1.5 text-xs text-ink-muted">{option.subLabel}</span>}
                  </ComboboxOption>
                ))
              )}
            </ComboboxOptions>
          </Transition>
        </div>
      </HeadlessCombobox>
    </div>
  );
}
