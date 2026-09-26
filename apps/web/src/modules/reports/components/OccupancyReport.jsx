import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BedDouble } from "lucide-react";
import { apiFetch } from "@/lib/api.js";
import { formatCurrencyExact, formatMoney } from "@/lib/format.js";
import { DataTable, EmptyState, Td, Tf, Th, Tr, TrendChart } from "@/ui/index.js";
import { REPORTS_OCCUPANCY_QUERY_KEY } from "@/modules/reports/constants.js";
import { bucketFor, bucketLabel, bucketize } from "@/modules/reports/reportPeriod.js";
import { InfoTip, KpiCard, KpiGrid, ReportLoadState, ReportPanel, Refetching } from "@/modules/reports/components/reportParts.jsx";

const pct = (sold, available) => (available ? Math.round((sold / available) * 1000) / 10 : 0);

function OccupancyBar({ percent }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted-strong" aria-hidden="true">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <span className="w-12 text-right tabular-nums">{percent}%</span>
    </div>
  );
}

export default function OccupancyReport({ from, to }) {
  const query = useQuery({
    queryKey: [REPORTS_OCCUPANCY_QUERY_KEY, from, to],
    queryFn: () => apiFetch(`/reports/occupancy?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  });
  const { data } = query;

  if (data === undefined) return <ReportLoadState query={query} title="Couldn't load the occupancy report" cards={5} />;

  if (data.totalRooms === 0) {
    return (
      <EmptyState icon={BedDouble} title="No rooms set up yet" subtitle="Occupancy is worked out against your rooms — add them in Rooms Setup." />
    );
  }

  const { actual, onTheBooks } = data;
  const bucket = bucketFor(from, to);
  // A week/month that straddles tonight keeps its two halves apart (they're
  // never averaged together): the column shows the actual nights so far,
  // and the tooltip adds what's on the books for the rest.
  const points = bucketize(
    data.daily,
    bucket,
    (key) => ({ key, actual: { sold: 0, available: 0 }, ahead: { sold: 0, available: 0 } }),
    (acc, d) => {
      const side = d.actual ? acc.actual : acc.ahead;
      side.sold += d.occupiedRooms;
      side.available += d.availableRooms;
    },
  );
  const showsBoth = actual.days > 0 && onTheBooks.days > 0;
  const soldTypes = data.byRoomType.reduce(
    (t, r) => ({ sold: t.sold + r.roomNightsSold, available: t.available + r.roomNightsAvailable, revenue: t.revenue + r.roomRevenue }),
    {
      sold: 0,
      available: 0,
      revenue: 0,
    },
  );

  const howCounted = (
    <InfoTip label="How occupancy is counted">
      <p>
        A room counts as occupied on a date if a guest is in it at midnight at the end of that date. A stay that starts and ends the same day counts
        for that day.
      </p>
      <p>
        <strong>Actual</strong> covers nights already past, timed by real check-in/check-out. <strong>On the books</strong> covers tonight and later:
        guests in house plus arrivals still expected. The two are never averaged together.
      </p>
      <p>Rooms under a maintenance block that night aren't counted as available.</p>
      <p>
        <strong>Avg. rate per sold night</strong> (ADR) = room revenue ÷ room-nights sold. <strong>Revenue per available night</strong> (RevPAR) =
        room revenue ÷ room-nights available. Room revenue excludes GST and discounts, and other charges.
      </p>
    </InfoTip>
  );

  return (
    <Refetching active={query.isFetching && query.isPlaceholderData}>
      <KpiGrid columns={onTheBooks.days > 0 ? 5 : 4}>
        <KpiCard
          label="Occupancy"
          value={actual.days ? `${actual.occupancyPercent}%` : "—"}
          sub={
            actual.days ? `${actual.roomNightsSold} of ${actual.roomNightsAvailable} room-nights sold` : "No nights in this period have passed yet"
          }
        />
        <KpiCard label="Avg. rate per sold night" value={actual.roomNightsSold ? formatCurrencyExact(actual.adr) : "—"} sub="ADR · excl. GST" />
        <KpiCard label="Revenue per available night" value={actual.days ? formatCurrencyExact(actual.revpar) : "—"} sub="RevPAR · excl. GST" />
        <KpiCard label="Average stay" value={actual.avgStayNights ? `${actual.avgStayNights} nights` : "—"} sub="Guests who arrived in this period" />
        {onTheBooks.days > 0 && (
          <KpiCard
            label="On the books"
            value={`${onTheBooks.occupancyPercent}%`}
            sub={`${onTheBooks.roomNightsSold} of ${onTheBooks.roomNightsAvailable} room-nights booked ahead`}
          />
        )}
      </KpiGrid>

      {points.length > 1 && (
        <ReportPanel
          className="mb-4"
          title={`Occupancy per ${bucket}`}
          subtitle={`${data.totalRooms} rooms · % of available rooms occupied at midnight`}
          actions={howCounted}
        >
          <TrendChart
            ariaLabel={`Occupancy per ${bucket}`}
            yMax={100}
            format={(v) => `${v}%`}
            legend={showsBoth ? [{ label: "Actual" }, { label: "On the books", muted: true }] : undefined}
            data={points.map((p) => {
              const isAhead = p.actual.available === 0;
              const shown = isAhead ? p.ahead : p.actual;
              return {
                key: p.key,
                label: bucketLabel(p.key, bucket),
                longLabel: `${bucketLabel(p.key, bucket, { long: true })}${isAhead ? " · on the books" : p.ahead.available ? " · actual so far" : ""}`,
                value: pct(shown.sold, shown.available),
                muted: isAhead,
                raw: p,
              };
            })}
            tooltip={(d) => [
              ...(d.raw.actual.available ? [{ label: "Room-nights sold", value: `${d.raw.actual.sold} / ${d.raw.actual.available}` }] : []),
              ...(d.raw.actual.available && d.raw.ahead.available
                ? [{ label: "On the books after", value: `${pct(d.raw.ahead.sold, d.raw.ahead.available)}%` }]
                : d.raw.ahead.available
                  ? [{ label: "Booked ahead", value: `${d.raw.ahead.sold} / ${d.raw.ahead.available}` }]
                  : []),
            ]}
          />
        </ReportPanel>
      )}

      <ReportPanel
        title="By room type"
        subtitle="Nights already past only — the same basis as the headline figures."
        actions={points.length > 1 ? undefined : howCounted}
      >
        <DataTable maxHeight="none" minWidth="720px">
          <thead>
            <tr>
              <Th pinned>Room type</Th>
              <Th align="right">Rooms</Th>
              <Th align="right">Room-nights sold</Th>
              <Th align="right">Occupancy</Th>
              <Th align="right">Avg. rate / night</Th>
              <Th align="right">Room revenue</Th>
            </tr>
          </thead>
          <tbody>
            {data.byRoomType.map((t) => (
              <Tr key={t.name}>
                <Td pinned className="whitespace-nowrap font-medium text-ink">
                  {t.name}
                </Td>
                <Td align="right" className="tabular-nums">
                  {t.rooms}
                </Td>
                <Td align="right" className="whitespace-nowrap tabular-nums">
                  {t.roomNightsSold} <span className="text-ink-muted">/ {t.roomNightsAvailable}</span>
                </Td>
                <Td align="right">
                  <OccupancyBar percent={t.occupancyPercent} />
                </Td>
                <Td align="right" className="whitespace-nowrap tabular-nums">
                  {t.roomNightsSold ? formatMoney(t.adr) : "—"}
                </Td>
                <Td align="right" className="whitespace-nowrap tabular-nums">
                  {formatMoney(t.roomRevenue)}
                </Td>
              </Tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <Tf pinned>All rooms</Tf>
              <Tf align="right" className="tabular-nums">
                {data.totalRooms}
              </Tf>
              <Tf align="right" className="whitespace-nowrap tabular-nums">
                {soldTypes.sold} / {soldTypes.available}
              </Tf>
              <Tf align="right">
                <OccupancyBar percent={pct(soldTypes.sold, soldTypes.available)} />
              </Tf>
              <Tf align="right" className="whitespace-nowrap tabular-nums">
                {soldTypes.sold ? formatMoney(actual.adr) : "—"}
              </Tf>
              <Tf align="right" className="whitespace-nowrap tabular-nums">
                {formatMoney(soldTypes.revenue)}
              </Tf>
            </tr>
          </tfoot>
        </DataTable>
      </ReportPanel>
    </Refetching>
  );
}
