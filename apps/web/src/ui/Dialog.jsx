import { Dialog as HeadlessDialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { X } from "lucide-react";
import { Fragment } from "react";

// Same external API as the old hand-rolled Modal (title/onClose/children/
// wide), now backed by Headless UI: focus trap, ESC-to-close, backdrop
// click, and enter/leave transitions come for free.
export default function Dialog({ title, actions, onClose, children, wide = false }) {
  return (
    <Transition appear show as={Fragment}>
      <HeadlessDialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-150"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel data-print-area className={`w-full overflow-hidden ${wide ? "max-w-2xl" : "max-w-md"} rounded-xl bg-card shadow-lg`}>
              <div className="divine-rule print:hidden" />
              {/* Title + close stay on their own row, always reachable, no
                  matter how many `actions` a caller passes — a screen with
                  several admin-only buttons (e.g. InvoiceModal's Edit Guest
                  Details / Cancel & Reissue / Print) used to share one row
                  with the title and close button, which on a narrow screen
                  had nowhere to go but squeeze each button's label into
                  wrapped, multi-line towers, shoving Print and the close X
                  off the edge of the panel entirely. Actions now get their
                  own wrapping row underneath instead. */}
              <div className="border-b border-line px-5 py-4 print:hidden">
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle className="font-display text-xl font-bold text-gray-900">{title}</DialogTitle>
                  <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="Close">
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>
                {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
              </div>
              <div className="max-h-[75vh] overflow-y-auto px-5 py-4 print:max-h-none print:overflow-visible">{children}</div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </HeadlessDialog>
    </Transition>
  );
}
