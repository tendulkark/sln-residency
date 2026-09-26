import { useEffect, useId, useRef, useState } from "react";

// A dependency-free column chart for a value over time (collections per
// day, occupancy per week, …) — replaces MiniBarChart wherever the reader
// needs to know *when*, not just the shape.
//
// `data = [{ key, label, longLabel?, value, muted? }]`, in time order.
// - `label` is the short x-axis tick ("12", "Sep"); `longLabel` heads the
//   hover tooltip ("Sat, 12 Sep").
// - `muted` draws that column as a lighter, hatched version of the same
//   color — a second state of the same measure (e.g. "on the books" vs
//   "actual"); the caller supplies the `legend` that names both states.
// - `format(value)` formats tooltip values and y-axis ticks; `yMax` pins
//   the top of the scale (100 for a percentage) instead of fitting the data.
// - `tooltip(d)` may return extra rows for the hover readout.
//
// Marks follow the app's chart rules: columns ≤ 24px wide with a 4px
// rounded data end and a square baseline, recessive 1px solid gridlines,
// axis text in ink tokens, and a hover/focus target covering the column's
// whole band (not just its painted pixels). A visually hidden table carries
// every value for screen readers.

const AXIS_WIDTH = 52;
const LABEL_HEIGHT = 22;
const TOP_PAD = 8;

function niceStep(range, targetTicks) {
  const rough = range / targetTicks;
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// A column path with a rounded data end (top for a positive value, bottom
// for a negative one) and a square end on the baseline.
function columnPath(x, w, yBase, yEnd) {
  const h = Math.abs(yEnd - yBase);
  const r = Math.min(4, w / 2, h);
  if (yEnd <= yBase) {
    return `M${x},${yBase} V${yEnd + r} Q${x},${yEnd} ${x + r},${yEnd} H${x + w - r} Q${x + w},${yEnd} ${x + w},${yEnd + r} V${yBase} Z`;
  }
  return `M${x},${yBase} V${yEnd - r} Q${x},${yEnd} ${x + r},${yEnd} H${x + w - r} Q${x + w},${yEnd} ${x + w},${yEnd - r} V${yBase} Z`;
}

export default function TrendChart({ data, format = (v) => String(v), yMax, height = 200, legend, tooltip, ariaLabel }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const patternId = useId();
  const [active, setActive] = useState(null);

  const values = data.map((d) => d.value);
  const dataMax = Math.max(0, ...values);
  const dataMin = Math.min(0, ...values);
  const top = yMax ?? (dataMax === dataMin ? 1 : dataMax);
  const step = niceStep(top - dataMin || 1, 4);
  const domainMax = yMax ?? Math.ceil(top / step) * step;
  const domainMin = dataMin < 0 ? Math.floor(dataMin / step) * step : 0;
  const ticks = [];
  for (let t = domainMin; t <= domainMax + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);

  const plotW = Math.max(0, width - AXIS_WIDTH);
  const plotH = height - LABEL_HEIGHT - TOP_PAD;
  const y = (v) => TOP_PAD + plotH - ((v - domainMin) / (domainMax - domainMin || 1)) * plotH;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44))));
  const activeDatum = active != null ? data[active] : null;

  return (
    <div>
      {legend && (
        <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-ink-soft">
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden="true">
                <defs>
                  <pattern id={`${patternId}-legend`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="4" height="4" fill="var(--color-brand)" opacity="0.3" />
                    <line x1="0" y1="0" x2="0" y2="4" stroke="var(--color-brand)" strokeWidth="1.5" opacity="0.6" />
                  </pattern>
                </defs>
                <rect width="12" height="12" rx="2" fill={item.muted ? `url(#${patternId}-legend)` : "var(--color-brand)"} />
              </svg>
              {item.label}
            </span>
          ))}
        </div>
      )}

      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setActive(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
            <defs>
              <pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill="var(--color-brand)" opacity="0.28" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="var(--color-brand)" strokeWidth="1.5" opacity="0.55" />
              </pattern>
            </defs>

            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={AXIS_WIDTH}
                  x2={width}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? "var(--color-line-strong)" : "var(--color-line-soft)"}
                  strokeWidth="1"
                />
                <text x={AXIS_WIDTH - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px] tabular-nums">
                  {format(t)}
                </text>
              </g>
            ))}

            {data.map((d, i) => {
              const x = AXIS_WIDTH + i * band + (band - barW) / 2;
              const isActive = active === i;
              return (
                <g key={d.key}>
                  {d.value !== 0 && (
                    <path
                      d={columnPath(x, barW, y(0), y(d.value))}
                      fill={d.muted ? `url(#${patternId})` : "var(--color-brand)"}
                      opacity={active == null || isActive ? 1 : 0.55}
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-ink-muted text-[11px] tabular-nums">
                      {d.label}
                    </text>
                  )}
                  <rect
                    x={AXIS_WIDTH + i * band}
                    y={TOP_PAD}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${d.longLabel ?? d.label}: ${format(d.value)}`}
                    className="cursor-default outline-none focus-visible:stroke-brand"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {activeDatum && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 min-w-[150px] rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-lg"
            // Beside the hovered column, at the top of the plot — never over
            // the column itself or out above the chart. Flips to the left
            // side in the right half so it stays inside the card.
            style={{
              top: TOP_PAD,
              left: AXIS_WIDTH + (active + 0.5) * band + (AXIS_WIDTH + (active + 0.5) * band > width / 2 ? -(barW / 2 + 10) : barW / 2 + 10),
              transform: AXIS_WIDTH + (active + 0.5) * band > width / 2 ? "translateX(-100%)" : undefined,
            }}
          >
            <p className="text-sm font-semibold tabular-nums text-ink">{format(activeDatum.value)}</p>
            <p className="text-ink-muted">{activeDatum.longLabel ?? activeDatum.label}</p>
            {tooltip?.(activeDatum)?.map((row) => (
              <p key={row.label} className="mt-0.5 flex justify-between gap-3 text-ink-soft">
                <span>{row.label}</span>
                <span className="font-medium tabular-nums text-ink">{row.value}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Hidden on the wrapper, not the table: a <caption> is laid out
          outside its table's box, so sr-only on the table left it visible. */}
      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.longLabel ?? d.label}</th>
                <td>{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
