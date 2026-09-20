import { useState } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, startOfMonth, startOfWeek, toISODate } from "@/lib/dateRange.js";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

// A jump-to-any-date calendar popover for the Week (and later Day) view's
// nav — MonthYearPicker's month-level granularity isn't precise enough
// once the range being paged is a single week, so this shows a real day
// grid instead. Selecting any date is enough: the caller derives its own
// range (a week, a day) from whatever date comes back.
export default function MiniDatePicker({ label, anchorDate, onSelect, highlightWeek = false }) {
  const [viewMonth, setViewMonth] = useState(startOfMonth(anchorDate));

  const gridStart = startOfWeek(viewMonth);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const selectedWeekStart = highlightWeek ? startOfWeek(anchorDate) : null;
  const todayIso = toISODate(new Date());

  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton
            onClick={() => setViewMonth(startOfMonth(anchorDate))}
            className="flex w-[190px] items-center justify-center gap-1.5 rounded-md border border-line-strong bg-card px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-muted"
          >
            <span className="min-w-0 truncate">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          </PopoverButton>
          <PopoverPanel anchor="bottom start" className="z-30 mt-2 w-72 rounded-xl border border-line bg-card p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setViewMonth((d) => {
                    const n = new Date(d);
                    n.setMonth(n.getMonth() - 1);
                    return n;
                  })
                }
                className="rounded p-1 text-gray-400 hover:bg-muted hover:text-gray-700"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900">
                {viewMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() =>
                  setViewMonth((d) => {
                    const n = new Date(d);
                    n.setMonth(n.getMonth() + 1);
                    return n;
                  })
                }
                className="rounded p-1 text-gray-400 hover:bg-muted hover:text-gray-700"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center">
              {DAY_INITIALS.map((d, i) => (
                <span key={i} className="text-[10px] font-semibold text-gray-400">
                  {d}
                </span>
              ))}
              {days.map((day) => {
                const iso = toISODate(day);
                const inMonth = day.getMonth() === viewMonth.getMonth();
                const isToday = iso === todayIso;
                const inSelectedWeek = selectedWeekStart && day >= selectedWeekStart && day < addDays(selectedWeekStart, 7);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      onSelect(day);
                      close();
                    }}
                    className={`rounded-md py-1.5 text-xs transition hover:bg-muted ${inSelectedWeek ? "bg-brand-tint" : ""} ${
                      isToday ? "font-bold text-brand" : inMonth ? "text-gray-700" : "text-gray-300"
                    }`}
                  >
                    {day.getDate()}
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
