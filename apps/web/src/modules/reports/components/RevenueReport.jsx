import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, IndianRupee } from "lucide-react";
import { apiFetch, downloadFile } from "@/lib/api.js";
import { formatCurrencyExact, formatMoney } from "@/lib/format.js";
import { BarList, Button, DataTable, EmptyState, Td, Tf, Th, Tr, TrendChart } from "@/ui/index.js";
import { REPORTS_REVENUE_QUERY_KEY } from "@/modules/reports/constants.js";
import { bucketFor, bucketLabel, bucketize } from "@/modules/reports/reportPeriod.js";
import {
  REPORT_TABLE_MAX_HEIGHT,
  InfoTip,
  KpiCard,
  KpiGrid,
  ReportLoadState,
  ReportPanel,
  Refetching,
  percentChange,
} from "@/modules/reports/components/reportParts.jsx";

const BUCKET_NOUN = { day: "day", week: "week", month: "month" };

// Money in and out of the desk: collections (net of refunds) by day,
// payment method and staff member, next to what was billed (invoices
// finalized) in the same period — the two differ by advances taken before
// a stay and dues settled after it.
export default function RevenueReport({ from, to }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const query = useQuery({
    queryKey: [REPORTS_REVENUE_QUERY_KEY, from, to],
    queryFn: () => apiFetch(`/reports/revenue?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  });
  const { data } = query;

  async function downloadCsv() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadFile(`/reports/revenue.csv?from=${from}&to=${to}`, `payments-${from}-to-${to}.csv`);
    } catch (err) {
      setDownloadError(`Couldn't download the CSV — ${err.message}`);
    } finally {
      setDownloading(false);
    }
  }

  if (data === undefined) return <ReportLoadState query={query} title="Couldn't load the revenue report" cards={4} />;

  const bucket = bucketFor(from, to);
  const methods = data.byMethod.map((m) => m.name);
  const periods = bucketize(
    data.daily,
    bucket,
    (key) => ({ key, received: 0, refunded: 0, net: 0, count: 0, byMethod: {} }),
    (acc, d) => {
      acc.received += d.received;
      acc.refunded += d.refunded;
      acc.net += d.net;
      acc.count += d.count;
      for (const [m, v] of Object.entries(d.byMethod)) acc.byMethod[m] = (acc.byMethod[m] ?? 0) + v;
    },
  );
  const nothing = data.received === 0 && data.refunded === 0 && data.billed.invoices === 0;
  const netTotal = data.net || 1;

  return (
    <Refetching active={query.isFetching && query.isPlaceholderData}>
      <KpiGrid columns={4}>
        <KpiCard
          label="Net collected"
          value={formatCurrencyExact(data.net)}
          delta={percentChange(data.net, data.previous.net)}
          sub={`Received ${formatCurrencyExact(data.received)} · refunded ${formatCurrencyExact(data.refunded)}`}
        />
        <KpiCard label="Received" value={formatCurrencyExact(data.received)} delta={percentChange(data.received, data.previous.received)} />
        <KpiCard
          label="Refunds paid out"
          value={formatCurrencyExact(data.refunded)}
          delta={percentChange(data.refunded, data.previous.refunded)}
          upIsGood={false}
        />
        <KpiCard
          label="Billed"
          value={formatCurrencyExact(data.billed.amount)}
          delta={percentChange(data.billed.amount, data.previous.billed.amount)}
          sub={`${data.billed.invoices} invoice${data.billed.invoices === 1 ? "" : "s"} finalized at checkout`}
        />
      </KpiGrid>

      {nothing ? (
        <EmptyState
          icon={IndianRupee}
          title="No money in or out in this period"
          subtitle="Payments and refunds show up here as soon as they're recorded at the desk."
        />
      ) : (
        <>
          {periods.length > 1 && (
            <ReportPanel
              className="mb-4"
              title={`Net collected per ${BUCKET_NOUN[bucket]}`}
              subtitle="Payments received minus refunds paid out, by the day they were recorded."
              actions={
                <InfoTip label="Collected vs billed">
                  <p>
                    <strong>Collected</strong> is money actually taken at the desk in this period (advances included), minus refunds.
                  </p>
                  <p>
                    <strong>Billed</strong> is the total of invoices finalized at checkout in this period. The two differ when a guest pays in advance
                    or settles after checkout.
                  </p>
                </InfoTip>
              }
            >
              <TrendChart
                ariaLabel={`Net collected per ${BUCKET_NOUN[bucket]}`}
                data={periods.map((p) => ({
                  key: p.key,
                  label: bucketLabel(p.key, bucket),
                  longLabel: bucketLabel(p.key, bucket, { long: true }),
                  value: Math.round(p.net * 100) / 100,
                  raw: p,
                }))}
                format={(v) => formatCurrencyExact(v)}
                tooltip={(d) => [
                  { label: "Received", value: formatCurrencyExact(d.raw.received) },
                  { label: "Refunded", value: formatCurrencyExact(d.raw.refunded) },
                  { label: "Transactions", value: d.raw.count },
                ]}
              />
            </ReportPanel>
          )}

          <div className="mb-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <ReportPanel title="By payment method" subtitle="Net of refunds, with each method's share of the total.">
              <BarList
                items={data.byMethod.map((m) => ({
                  key: m.name,
                  label: m.name,
                  value: Math.max(0, m.net),
                  display: formatCurrencyExact(m.net),
                  sub: `${Math.round((m.net / netTotal) * 100)}% · ${m.count} transaction${m.count === 1 ? "" : "s"}${m.refunded ? ` · ${formatCurrencyExact(m.refunded)} refunded` : ""}`,
                }))}
              />
            </ReportPanel>

            <ReportPanel title="By staff member" subtitle="Who took (or paid out) the money — for shift handover.">
              <ul className="divide-y divide-line-soft">
                {data.byStaff.map((s) => (
                  <li key={s.name} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-ink">{s.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">{formatCurrencyExact(s.net)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {Object.entries(s.byMethod)
                        .sort(([, a], [, b]) => b - a)
                        .map(([m, v]) => `${m} ${formatCurrencyExact(v)}`)
                        .join(" · ")}
                      {s.refunded ? ` · refunds ${formatCurrencyExact(s.refunded)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </ReportPanel>
          </div>

          <ReportPanel
            title={`Collections by ${BUCKET_NOUN[bucket]} and method`}
            subtitle="Each method is net of refunds paid out through it, so a row matches the cash drawer and the bank / UPI statement. The last column shows how much was refunded."
            actions={
              <Button variant="outline" size="sm" onClick={downloadCsv} loading={downloading}>
                {!downloading && <Download className="h-4 w-4" />}
                Download payments CSV
              </Button>
            }
          >
            {downloadError && <div className="mb-3 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">{downloadError}</div>}
            <DataTable maxHeight={REPORT_TABLE_MAX_HEIGHT} minWidth={`${260 + methods.length * 130 + 260}px`}>
              <thead>
                <tr>
                  <Th pinned>{bucket === "day" ? "Date" : bucket === "week" ? "Week" : "Month"}</Th>
                  {methods.map((m) => (
                    <Th key={m} align="right">
                      {m}
                    </Th>
                  ))}
                  <Th align="right">Net</Th>
                  <Th align="right">Refunds incl.</Th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <Tr key={p.key} className={p.count === 0 ? "text-ink-faint" : ""}>
                    <Td pinned className="whitespace-nowrap">
                      {bucketLabel(p.key, bucket, { long: true })}
                    </Td>
                    {methods.map((m) => (
                      <Td key={m} align="right" className="whitespace-nowrap tabular-nums">
                        {p.byMethod[m] ? formatMoney(p.byMethod[m]) : "—"}
                      </Td>
                    ))}
                    <Td align="right" className="whitespace-nowrap font-semibold tabular-nums">
                      {p.count ? formatMoney(p.net) : "—"}
                    </Td>
                    <Td align="right" className="whitespace-nowrap tabular-nums text-ink-muted">
                      {p.refunded ? formatMoney(p.refunded) : "—"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <Tf pinned>Total</Tf>
                  {data.byMethod.map((m) => (
                    <Tf key={m.name} align="right" className="whitespace-nowrap tabular-nums">
                      {formatMoney(m.net)}
                    </Tf>
                  ))}
                  <Tf align="right" className="whitespace-nowrap tabular-nums">
                    {formatMoney(data.net)}
                  </Tf>
                  <Tf align="right" className="whitespace-nowrap tabular-nums">
                    {data.refunded ? formatMoney(data.refunded) : "—"}
                  </Tf>
                </tr>
              </tfoot>
            </DataTable>
          </ReportPanel>
        </>
      )}
    </Refetching>
  );
}
