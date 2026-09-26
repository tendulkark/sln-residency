import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toISODate } from "@/lib/dateRange.js";
import { Button, Input, SegmentedControl } from "@/ui/index.js";
import MiniDatePicker from "@/modules/reservations/components/MiniDatePicker.jsx";
import MonthYearPicker from "@/modules/reservations/components/MonthYearPicker.jsx";
import { PERIOD_OPTIONS, isCurrentPeriod, periodLabel, stepAnchor } from "@/modules/reports/reportPeriod.js";

const JUMP_LABEL = { day: "Today", week: "This week", month: "This month", year: "This year" };

function YearPicker({ anchorDate, onSelect }) {
  const current = new Date().getFullYear();
  const years = Array.from({ length: 9 }, (_, i) => current - 6 + i);
  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton className="flex w-[190px] items-center justify-center gap-1.5 rounded-md border border-line-strong bg-card px-3 py-1.5 text-sm font-semibold text-ink hover:bg-muted">
            {anchorDate.getFullYear()}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          </PopoverButton>
          <PopoverPanel anchor="bottom start" className="z-30 mt-2 w-56 rounded-xl border border-line bg-card p-3 shadow-lg">
            <div className="grid grid-cols-3 gap-1.5">
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => {
                    onSelect(new Date(year, 0, 1));
                    close();
                  }}
                  className={`rounded-md px-2 py-1.5 text-sm font-medium tabular-nums transition ${
                    year === anchorDate.getFullYear() ? "bg-brand text-white" : "text-ink-soft hover:bg-muted"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}

// Day | Week | Month | Year | Custom, with ‹ › to step a whole period at a
// time and the label itself opening a picker to jump anywhere. Weeks run
// Sunday–Saturday, like the rest of the app. Custom swaps the stepper for
// From/To dates.
export default function ReportPeriodPicker({ period, anchor, from, to, onChange }) {
  const set = (patch) => onChange({ period, anchor, from, to, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(next) => {
          // Switching to Custom starts from the range already on screen, so
          // it can be widened or narrowed rather than retyped. Switching
          // between named periods keeps "now" if it's on screen (This
          // month → this week), otherwise the start of what's on screen
          // (March → the first week of March).
          if (next === "custom") return set({ period: next, from, to });
          const today = toISODate(new Date());
          set({ period: next, anchor: from <= today && today <= to ? new Date() : new Date(`${from}T00:00:00`) });
        }}
      />

      {period === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="From"
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && set({ from: e.target.value, to: e.target.value > to ? e.target.value : to })}
          />
          <span className="text-sm text-ink-muted">to</span>
          <Input
            aria-label="To"
            type="date"
            value={to}
            min={from}
            onChange={(e) => e.target.value && set({ to: e.target.value, from: e.target.value < from ? e.target.value : from })}
          />
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label={`Previous ${period}`} onClick={() => set({ anchor: stepAnchor(period, anchor, -1) })}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {period === "month" && <MonthYearPicker anchorDate={anchor} onSelect={(d) => set({ anchor: d })} />}
          {period === "year" && <YearPicker anchorDate={anchor} onSelect={(d) => set({ anchor: d })} />}
          {(period === "day" || period === "week") && (
            <MiniDatePicker label={periodLabel(period, anchor)} anchorDate={anchor} onSelect={(d) => set({ anchor: d })} highlightWeek={period === "week"} />
          )}
          <Button variant="outline" size="sm" aria-label={`Next ${period}`} onClick={() => set({ anchor: stepAnchor(period, anchor, 1) })}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentPeriod(period, anchor) && (
            <Button variant="ghost" size="sm" onClick={() => set({ anchor: new Date() })}>
              {JUMP_LABEL[period]}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
