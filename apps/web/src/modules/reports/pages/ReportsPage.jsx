import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BedDouble, ClipboardList, IndianRupee, Landmark, Printer, ReceiptText } from "lucide-react";
import { useAuthStore } from "@/app/authStore.js";
import { Button, PageHeader } from "@/ui/index.js";
import ReportPeriodPicker from "@/modules/reports/components/ReportPeriodPicker.jsx";
import BookingsReport from "@/modules/reports/components/BookingsReport.jsx";
import RevenueReport from "@/modules/reports/components/RevenueReport.jsx";
import OccupancyReport from "@/modules/reports/components/OccupancyReport.jsx";
import GstReport from "@/modules/reports/components/GstReport.jsx";
import { rangeLabel, readReportParams, writeReportParams } from "@/modules/reports/reportPeriod.js";

const TABS = [
  { value: "bookings", label: "Bookings", icon: ClipboardList, component: BookingsReport },
  { value: "revenue", label: "Revenue", icon: IndianRupee, component: RevenueReport },
  { value: "occupancy", label: "Occupancy", icon: BedDouble, component: OccupancyReport },
  { value: "gst", label: "GST", icon: Landmark, component: GstReport },
];

// Rooms Reports: one period (Day/Week/Month/Year/Custom) scopes every tab,
// and the tab + period live in the URL (see reportPeriod.js). Each tab owns
// its own filters and its own CSV export, next to the table it exports.
export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readReportParams(searchParams);
  const tenant = useAuthStore((s) => s.tenant);
  const active = TABS.find((t) => t.value === params.tab) ?? TABS[0];
  const Report = active.component;

  const update = (patch) => setSearchParams(writeReportParams({ ...params, ...patch }));

  // The title, tabs and period stay pinned while the report scrolls
  // (tablet/desktop — on a phone they'd take a third of the screen). A
  // zero-height sentinel just above tells us when it has actually stuck,
  // so the shadow only appears once content is sliding underneath. It sticks
  // at -top-6 (minus <main>'s padding): sticky offsets are measured from the
  // scroller's content edge, so top-0 would float it 24px down, over the
  // report.
  const sentinelRef = useRef(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div>
      <div ref={sentinelRef} aria-hidden="true" />
      <div
        className={`-mx-4 -mt-4 mb-5 bg-surface px-4 pt-4 pb-3 transition-shadow md:sticky md:-top-6 md:z-20 md:-mx-6 md:-mt-6 md:px-6 md:pt-6 print:static print:hidden ${
          stuck ? "md:border-b md:border-line md:shadow-[0_6px_16px_-10px_rgba(60,20,30,0.25)]" : ""
        }`}
      >
        <PageHeader
          icon={ReceiptText}
          title="Rooms Reports"
          subtitle="Bookings, revenue, occupancy & GST for any day, week, month, year or custom range"
          actions={
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Report">
            {TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={active.value === t.value}
                onClick={() => update({ tab: t.value })}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring ${
                  active.value === t.value ? "border-brand bg-brand text-white" : "border-line-strong bg-card text-ink-soft hover:bg-muted"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <ReportPeriodPicker period={params.period} anchor={params.anchor} from={params.from} to={params.to} onChange={update} />
        </div>
      </div>

      <div data-print-area>
        <div className="mb-4 hidden border-b border-line pb-3 print:block">
          <p className="font-display text-xl font-bold text-ink">{tenant?.name}</p>
          <p className="text-sm text-ink-soft">
            {active.label} report · {rangeLabel(params.from, params.to)}
          </p>
          <p className="text-xs text-ink-muted">Generated {new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
        <Report from={params.from} to={params.to} />
      </div>
    </div>
  );
}
