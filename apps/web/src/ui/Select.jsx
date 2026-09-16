import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Transition } from "@headlessui/react";
import { Check, ChevronDown } from "lucide-react";
import { Fragment } from "react";

// Native-<select>-like API on top of Headless UI's Listbox, so every
// dropdown in the app looks and behaves the same and is themeable from one
// place. `options` is always the caller's own data — nothing here is ever
// a hardcoded list (AI_RULES.md #1).
export default function Select({ label, options, value, onChange, placeholder = "Select…", disabled, error }) {
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <div className="space-y-1">
      {label && <span className="block text-sm font-medium text-gray-700">{label}</span>}
      <Listbox value={value ?? ""} onChange={onChange} disabled={disabled}>
        <div className="relative">
          <ListboxButton
            className={`relative w-full rounded-md border bg-white py-2 pl-3 pr-9 text-left text-sm focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 ${
              error ? "border-red-300" : "border-gray-300"
            }`}
          >
            <span className={selected ? "text-gray-900" : "text-gray-400"}>{selected ? selected.label : placeholder}</span>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </ListboxButton>
          <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <ListboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg focus:outline-none">
              {options.length === 0 && <div className="px-3 py-2 text-gray-400">No options</div>}
              {options.map((option) => (
                <ListboxOption
                  key={option.value}
                  value={option.value}
                  className="relative cursor-pointer select-none px-3 py-2 pl-9 text-gray-900 data-[focus]:bg-brand-tint"
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
          </Transition>
        </div>
      </Listbox>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
