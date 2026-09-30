import Link from "next/link";
import { PM25_BANDS, PSI_BANDS, thresholdsFor, type Band } from "@/lib/bands";
import type { Pm25Forecast } from "@/lib/forecast";
import { titleCase } from "@/lib/format";
import type { MetricId } from "@/lib/metrics";
import { RANGES, type RangeKey, type SeriesPoint } from "@/lib/queries";
import { DISPLAY_ORDER } from "@/lib/schema";
import { HOUR } from "@/lib/time";
import { Card } from "./card";
import { ByMetric, MetricToggle } from "./metric-toggle";
import { pill } from "./pill";
import { TrendChart, type ChartPoint, type ChartSeries } from "./trend-chart";

const REGION_SERIES: ChartSeries[] = DISPLAY_ORDER.map((r, i) => ({ key: r, label: titleCase(r), color: `var(--series-${i + 1})` }));
const FORECAST_SERIES: ChartSeries = { key: "forecast", label: "Forecast (model)", color: "var(--ink-2)", dashed: true };

const CHARTS: Record<MetricId, { title: string; subtitle: string; unit: string; bands: Band[] }> = {
  pm25: { title: "1-hr PM2.5 by region", subtitle: "Hourly fine particulate concentration, µg/m³", unit: "µg/m³", bands: PM25_BANDS },
  psi: { title: "24-hr PSI by region", subtitle: "Rolling 24-hour Pollutant Standards Index", unit: "24-hr PSI", bands: PSI_BANDS },
};

/**
 * Appends the model's PM2.5 forecast as an extra dashed series, starting at the latest reading so the
 * line continues from "now". Looks ahead half the chart's span, up to 48 hours.
 */
function withForecast(points: ChartPoint[], forecast: Pm25Forecast, spanHours: number): ChartPoint[] {
  const last = points.at(-1)?.t ?? 0;
  const horizon = last + Math.min(48, spanHours / 2) * HOUR;
  const byTime = new Map(forecast.points.map((p) => [p.t, p.v]));
  const blanks = REGION_SERIES.map(() => null);
  return [
    ...points.map((p) => ({ t: p.t, v: [...p.v, p.t === last ? (byTime.get(p.t) ?? null) : null] })),
    ...forecast.points.filter((p) => p.t > last && p.t <= horizon).map((p) => ({ t: p.t, v: [...blanks, p.v] })),
  ];
}

/** Time-range picker and the trend chart, which follows the Now / 24-hr PSI toggle. */
export function TrendSection({ series, range, forecast }: { series: SeriesPoint[]; range: RangeKey; forecast: Pm25Forecast | null }) {
  const { hours, bucket, label } = RANGES[range];

  const chart = (field: MetricId) => {
    const c = CHARTS[field];
    let points: ChartPoint[] = series.map((p) => ({ t: p.t, v: DISPLAY_ORDER.map((r) => p.values[r]?.[field] ?? null) }));
    // A daily-maximum chart has no room for an hourly forecast.
    const forecasting = field === "pm25" && bucket === "hour" && forecast != null;
    if (forecasting) points = withForecast(points, forecast, hours);
    return (
      <Card
        title={c.title}
        subtitle={`${c.subtitle}${bucket === "day" ? " · daily maximum" : ""}${forecasting ? " · dashed: model forecast, islandwide" : ""}`}
        action={<MetricToggle />}
        className="mt-4"
      >
        <TrendChart
          series={forecasting ? [...REGION_SERIES, FORECAST_SERIES] : REGION_SERIES}
          points={points}
          unit={c.unit}
          ariaLabel={`${c.title} over the last ${label}`}
          bucket={bucket}
          thresholds={thresholdsFor(c.bands)}
        />
      </Card>
    );
  };

  return (
    <>
      <nav className="mt-8 flex flex-wrap items-center gap-2" aria-label="Time range">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <Link
            key={k}
            href={`/?range=${k}`}
            scroll={false}
            aria-current={k === range ? "page" : undefined}
            className={`text-sm ${pill(k === range)}`}
          >
            {RANGES[k].label}
          </Link>
        ))}
      </nav>
      <ByMetric views={{ pm25: chart("pm25"), psi: chart("psi") }} />
    </>
  );
}
