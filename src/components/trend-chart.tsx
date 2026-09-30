"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmtPoint, sgtFormat } from "@/lib/format";
import type { Bucket } from "@/lib/queries";
import { DAY, HOUR, SGT_OFFSET } from "@/lib/time";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  /** Dashed line, for projected values (a forecast) rather than readings. */
  dashed?: boolean;
}

export interface ChartPoint {
  t: number;
  /** One value per series, in series order. */
  v: (number | null)[];
}

interface Threshold {
  value: number;
  /** Name of the band that starts above `value`; drawn just above the line. */
  label: string;
}

interface Props {
  series: ChartSeries[];
  points: ChartPoint[];
  thresholds?: Threshold[];
  unit: string;
  ariaLabel: string;
  bucket?: Bucket;
}

// Plot geometry is in SVG user units (the SVG is drawn at its measured CSS size, so 1 unit = 1 CSS px).
const M = { top: 12, right: 12, bottom: 28, left: 36 };
/** Extra right gutter that holds the band labels, clear of the lines. */
const BAND_GUTTER = 84;

const fmtHour = sgtFormat({ hour: "numeric" });
const fmtDay = sgtFormat({ day: "numeric", month: "short" });
const fmtMonth = sgtFormat({ month: "short" });
const fmtYear = sgtFormat({ year: "numeric" });
/** Minimum room per x-axis label, in SVG units. */
const MIN_TICK_GAP = 40;

function niceStep(span: number, count: number) {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

/** X ticks aligned to SGT: every 6/12/24/120 hours, or the first of each month for long spans. */
function xTicks(t0: number, t1: number): { ticks: number[]; monthly: boolean; daily: boolean } {
  const spanHours = (t1 - t0) / HOUR;
  if (spanHours > 24 * 90) {
    const d = new Date(t0 + SGT_OFFSET);
    const ticks: number[] = [];
    for (let m = d.getUTCMonth() + 1; ; m++) {
      const t = Date.UTC(d.getUTCFullYear(), m, 1) - SGT_OFFSET; // Date.UTC rolls months past December
      if (t > t1) break;
      ticks.push(t);
    }
    return { ticks, monthly: true, daily: true };
  }
  const step = (spanHours <= 30 ? 6 : spanHours <= 80 ? 12 : spanHours <= 200 ? 24 : 120) * HOUR;
  const ticks: number[] = [];
  for (let t = Math.ceil((t0 + SGT_OFFSET) / step) * step - SGT_OFFSET; t <= t1; t += step) ticks.push(t);
  return { ticks, monthly: false, daily: step >= DAY };
}

/** A short line sample in the series' colour and style, for the legend and tooltip. */
const Swatch = ({ series: s }: { series: ChartSeries }) => (
  <svg width="0.875rem" height="0.25rem" viewBox="0 0 14 4" aria-hidden className="shrink-0">
    <line x1="1" x2="13" y1="2" y2="2" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={s.dashed ? "3 3" : undefined} />
  </svg>
);

export function TrendChart({ series, points, thresholds = [], unit, ariaLabel, bucket = "hour" }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 240 });
  const [active, setActive] = useState<number | null>(null);
  const { width, height } = size;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const right = thresholds.length ? BAND_GUTTER : M.right;
    const innerW = width - M.left - right;
    const innerH = height - M.top - M.bottom;
    const t0 = points[0]?.t ?? 0;
    const t1 = points[points.length - 1]?.t ?? t0 + HOUR;
    const x = (t: number) => M.left + ((t - t0) / Math.max(t1 - t0, HOUR)) * innerW;

    const dataMax = Math.max(1, ...points.flatMap((p) => p.v.filter((v): v is number => v != null)));
    let top = dataMax * 1.1;
    // Pull the next band boundary into view when the data is approaching it.
    const next = thresholds.find((th) => th.value > dataMax);
    if (next && next.value < dataMax * 1.4) top = next.value * 1.08;
    const step = niceStep(top, 4);
    const yMax = Math.ceil(top / step) * step;
    const y = (v: number) => M.top + innerH - (v / yMax) * innerH;
    const yTicks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);

    const ticks = xTicks(t0, t1);
    // Thin the labels so neighbours never collide at narrow widths.
    const every = Math.ceil(MIN_TICK_GAP / (innerW / Math.max(ticks.ticks.length, 1)));
    ticks.ticks = ticks.ticks.filter((_, i) => i % every === 0);

    // Break a line wherever readings are missing, rather than drawing straight across the gap.
    const maxGap = 2 * (bucket === "day" ? DAY : HOUR);
    const paths = series.map((_, si) => {
      let d = "";
      let prev: number | null = null;
      for (const p of points) {
        const v = p.v[si];
        if (v == null) {
          prev = null;
          continue;
        }
        d += `${prev != null && p.t - prev <= maxGap ? "L" : "M"}${x(p.t).toFixed(1)},${y(v).toFixed(1)}`;
        prev = p.t;
      }
      return d;
    });

    return { right, innerW, innerH, x, y, yMax, yTicks, ticks, paths };
  }, [width, height, points, series, thresholds, bucket]);

  const tickLabel = (t: number) => {
    // Months, with the year standing in for January so the axis shows where years change.
    if (geo.ticks.monthly) return (new Date(t + SGT_OFFSET).getUTCMonth() === 0 ? fmtYear : fmtMonth).format(t);
    const midnight = (t + SGT_OFFSET) % DAY === 0;
    return (geo.ticks.daily || midnight ? fmtDay : fmtHour).format(t);
  };

  const nearest = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(geo.x(points[i].t) - px) < Math.abs(geo.x(points[best].t) - px)) best = i;
    }
    return best;
  };

  const onPointerMove = (e: PointerEvent) => points.length && setActive(nearest(e.clientX));
  const onKeyDown = (e: KeyboardEvent) => {
    if (!points.length) return;
    const last = points.length - 1;
    if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? last) - 1));
    else if (e.key === "ArrowRight") setActive((i) => Math.min(last, (i ?? last) + 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const activePoint = active != null ? points[active] : null;
  const ax = activePoint ? geo.x(activePoint.t) : 0;
  // Tooltip sits beside the crosshair, flipping to its left side past 60% of the width.
  const tooltipStyle = {
    left: `${(ax / width) * 100}%`,
    transform: ax / width > 0.6 ? "translateX(calc(-100% - 0.75rem))" : "translateX(0.75rem)",
  };

  if (points.length === 0) {
    return <div className="flex h-60 items-center justify-center text-sm text-muted">No readings in this range yet.</div>;
  }

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <Swatch series={s} />
            {s.label}
          </li>
        ))}
      </ul>
      <div
        ref={wrapRef}
        className="relative h-60 touch-pan-y rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--series-1)]"
        tabIndex={0}
        role="img"
        aria-label={`${ariaLabel}. Use left and right arrow keys to read values.`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={height} className="absolute inset-0 block overflow-visible" aria-hidden>
          {geo.yTicks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={width - geo.right} y1={geo.y(v)} y2={geo.y(v)} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={M.left - 6} y={geo.y(v)} dy="0.32em" textAnchor="end" className="tabular fill-muted text-[0.625rem]">
                {v.toLocaleString()}
              </text>
            </g>
          ))}
          {thresholds
            .filter((th) => th.value < geo.yMax)
            .map((th) => (
              <g key={th.value}>
                <line x1={M.left} x2={width - geo.right + 4} y1={geo.y(th.value)} y2={geo.y(th.value)} stroke="var(--axis)" strokeWidth={1} />
                <text x={width - geo.right + 8} y={geo.y(th.value)} dy="-0.35em" className="fill-muted text-[0.625rem]">
                  {th.label}
                </text>
              </g>
            ))}
          {geo.ticks.ticks.map((t) => (
            <text key={t} x={geo.x(t)} y={height - 8} textAnchor="middle" className="tabular fill-muted text-[0.625rem]">
              {tickLabel(t)}
            </text>
          ))}
          {geo.paths.map((d, i) => (
            <path
              key={series[i].key}
              d={d}
              fill="none"
              stroke={series[i].color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={series[i].dashed ? "5 5" : undefined}
            />
          ))}
          {activePoint && (
            <g>
              <line x1={ax} x2={ax} y1={M.top} y2={height - M.bottom} stroke="var(--axis)" strokeWidth={1} />
              {activePoint.v.map((v, i) =>
                v == null ? null : (
                  <circle key={series[i].key} cx={ax} cy={geo.y(v)} r={4} fill={series[i].color} stroke="var(--surface)" strokeWidth={2} />
                ),
              )}
            </g>
          )}
        </svg>
        {activePoint && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-44 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg"
            style={tooltipStyle}
          >
            <div className="mb-1.5 text-muted">{fmtPoint(activePoint.t, bucket)}</div>
            {series
              .map((s, i) => ({ s, v: activePoint.v[i] }))
              .filter(({ v }) => v != null)
              .sort((a, b) => (b.v ?? -1) - (a.v ?? -1))
              .map(({ s, v }) => (
                <div key={s.key} className="flex items-center gap-2 py-0.5">
                  <Swatch series={s} />
                  <span className="tabular font-semibold text-ink">{v ?? "–"}</span>
                  <span className="text-ink-2">{s.label}</span>
                </div>
              ))}
            <div className="mt-1 text-[0.625rem] text-muted">{unit}</div>
          </div>
        )}
      </div>
    </div>
  );
}
