import { Menu as HeadlessMenu, MenuButton, MenuItem, MenuItems, Transition } from "@headlessui/react";
import { MoreVertical } from "lucide-react";
import { Fragment } from "react";

// A "…" actions menu driven entirely by a config array —
// `items = [{ label, icon, onClick, tone }]` — so callers add/remove
// actions without touching this file.
export default function Menu({ items }) {
  return (
    <HeadlessMenu as="div" className="relative inline-block text-left">
      <MenuButton className="rounded-md p-1 text-gray-400 hover:bg-muted-strong hover:text-gray-600" aria-label="Actions">
        <MoreVertical className="h-4 w-4" />
      </MenuButton>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
      >
        <MenuItems className="absolute right-0 z-20 mt-1 w-40 origin-top-right rounded-md border border-line bg-card py-1 shadow-lg focus:outline-none">
          {items.map((item) => (
            <MenuItem key={item.label}>
              {({ focus }) => (
                <button
                  onClick={item.onClick}
                  disabled={item.disabled}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                    focus ? "bg-muted" : ""
                  } ${item.tone === "danger" ? "text-red-600" : "text-gray-700"}`}
                >
                  {item.icon && <item.icon className="h-3.5 w-3.5" />}
                  {item.label}
                </button>
              )}
            </MenuItem>
          ))}
        </MenuItems>
      </Transition>
    </HeadlessMenu>
  );
}
