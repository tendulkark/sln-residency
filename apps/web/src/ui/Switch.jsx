import { Switch as HeadlessSwitch, SwitchGroup, SwitchLabel } from "@headlessui/react";

export default function Switch({ label, description, checked, onChange }) {
  return (
    <SwitchGroup as="div" className="flex items-center justify-between gap-3">
      <span className="flex flex-col">
        <SwitchLabel as="span" className="text-sm font-medium text-gray-700">
          {label}
        </SwitchLabel>
        {description && <span className="text-xs text-gray-500">{description}</span>}
      </span>
      <HeadlessSwitch
        checked={checked}
        onChange={onChange}
        className={`${checked ? "bg-brand" : "bg-gray-200"} relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring`}
      >
        <span className={`${checked ? "translate-x-6" : "translate-x-1"} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
      </HeadlessSwitch>
    </SwitchGroup>
  );
}
