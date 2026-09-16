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
export default function Combobox({ label, query, onQueryChange, options, onSelect, placeholder, createLabel }) {
  return (
    <div className="space-y-1">
      {label && <span className="block text-sm font-medium text-gray-700">{label}</span>}
      <HeadlessCombobox value={null} onChange={(value) => value && onSelect(value)}>
        <div className="relative">
          <ComboboxInput
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            displayValue={() => query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
          <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg focus:outline-none">
              {options.length === 0 ? (
                <div className="px-3 py-2 text-gray-400">{createLabel ?? "No matches — a new record will be created"}</div>
              ) : (
                options.map((option) => (
                  <ComboboxOption
                    key={option.value}
                    value={option}
                    className="cursor-pointer select-none px-3 py-2 text-gray-900 data-[focus]:bg-brand-tint"
                  >
                    {option.label}
                    {option.subLabel && <span className="ml-1.5 text-xs text-gray-400">{option.subLabel}</span>}
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
