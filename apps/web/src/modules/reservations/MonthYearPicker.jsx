import { useState } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A jump-to-any-month picker, opened by clicking the current month/year
// label — the calendar's own Prev/Next buttons only step one unit at a
// time, which gets tedious jumping several months away.
export default function MonthYearPicker({ anchorDate, onSelect }) {
  const [pickerYear, setPickerYear] = useState(anchorDate.getFullYear());

  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton
            onClick={() => setPickerYear(anchorDate.getFullYear())}
            className="flex w-[190px] items-center justify-center gap-1.5 rounded-md border border-line-strong bg-card px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-muted"
          >
            <span className="min-w-0 truncate">{anchorDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          </PopoverButton>
          <PopoverPanel anchor="bottom start" className="z-30 mt-2 w-64 rounded-xl border border-line bg-card p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPickerYear((y) => y - 1)}
                className="rounded p-1 text-gray-400 hover:bg-muted hover:text-gray-700"
                aria-label="Previous year"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900">{pickerYear}</span>
              <button
                type="button"
                onClick={() => setPickerYear((y) => y + 1)}
                className="rounded p-1 text-gray-400 hover:bg-muted hover:text-gray-700"
                aria-label="Next year"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTH_LABELS.map((label, i) => {
                const isActive = pickerYear === anchorDate.getFullYear() && i === anchorDate.getMonth();
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      onSelect(new Date(pickerYear, i, 1));
                      close();
                    }}
                    className={`rounded-md px-2 py-1.5 text-sm font-medium transition ${
                      isActive ? "bg-brand text-white" : "text-gray-700 hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                onSelect(new Date());
                close();
              }}
              className="mt-2 w-full rounded-md border border-line-strong px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-muted"
            >
              Jump to today
            </button>
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}
