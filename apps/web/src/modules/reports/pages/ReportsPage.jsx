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

  return (
    <div>
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

      <div className="mb-4 flex flex-wrap gap-2 print:hidden" role="tablist" aria-label="Report">
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

      <div className="mb-5 print:hidden">
        <ReportPeriodPicker period={params.period} anchor={params.anchor} from={params.from} to={params.to} onChange={update} />
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
