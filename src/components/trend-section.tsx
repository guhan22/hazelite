import Link from "next/link";
import { aqiFromPm25, AQI_BANDS, PM25_BANDS, PSI_BANDS, thresholdsFor, type Band } from "@/lib/bands";
import type { Pm25Forecast } from "@/lib/forecast";
import { titleCase } from "@/lib/format";
import type { MetricId } from "@/lib/metrics";
import { RANGES, type RangeKey, type RegionValues, type SeriesPoint } from "@/lib/queries";
import { DISPLAY_ORDER } from "@/lib/schema";
import { HOUR } from "@/lib/time";
import { Card } from "./card";
import { ByMetric, MetricToggle } from "./metric-toggle";
import { pill } from "./styles";
import { TrendChart, type ChartPoint, type ChartSeries } from "./trend-chart";

const REGION_SERIES: ChartSeries[] = DISPLAY_ORDER.map((r, i) => ({ key: r, label: titleCase(r), color: `var(--series-${i + 1})` }));
const FORECAST_SERIES: ChartSeries = { key: "forecast", label: "Forecast (model)", color: "var(--ink-2)", dashed: true };

const CHARTS: Record<
  MetricId,
  {
    title: string;
    subtitle: string;
    unit: string;
    bands: Band[];
    value: (v: RegionValues | undefined) => number | null;
    /** Converts the model's PM2.5 forecast to this chart's measure; absent means no forecast line. */
    fromPm25?: (pm25: number) => number | null;
  }
> = {
  aqi: {
    title: "1-hr AQI by region",
    subtitle: "US EPA Air Quality Index from hourly PM2.5",
    unit: "AQI",
    bands: AQI_BANDS,
    value: (v) => aqiFromPm25(v?.pm25),
    fromPm25: aqiFromPm25,
  },
  pm25: {
    title: "1-hr PM2.5 by region",
    subtitle: "Hourly fine particulate concentration, µg/m³",
    unit: "µg/m³",
    bands: PM25_BANDS,
    value: (v) => v?.pm25 ?? null,
    fromPm25: (pm25) => pm25,
  },
  psi: { title: "24-hr PSI by region", subtitle: "Rolling 24-hour Pollutant Standards Index", unit: "24-hr PSI", bands: PSI_BANDS, value: (v) => v?.psi ?? null },
};

/**
 * Appends the model's PM2.5 forecast as an extra dashed series, starting at the latest reading so the
 * line continues from "now". Looks ahead half the chart's span, up to 48 hours.
 */
function withForecast(points: ChartPoint[], forecast: Pm25Forecast, spanHours: number, convert: (pm25: number) => number | null): ChartPoint[] {
  const last = points.at(-1)?.t ?? 0;
  const horizon = last + Math.min(48, spanHours / 2) * HOUR;
  const byTime = new Map(forecast.points.map((p) => [p.t, convert(p.v)]));
  const blanks = REGION_SERIES.map(() => null);
  return [
    ...points.map((p) => ({ t: p.t, v: [...p.v, p.t === last ? (byTime.get(p.t) ?? null) : null] })),
    ...forecast.points.filter((p) => p.t > last && p.t <= horizon).map((p) => ({ t: p.t, v: [...blanks, byTime.get(p.t) ?? null] })),
  ];
}

/** Time-range picker and the trend chart, which follows the 1-hr AQI / 1-hr PM2.5 / 24-hr PSI toggle. */
export function TrendSection({
  series,
  range,
  forecast,
  hrefFor,
}: {
  series: SeriesPoint[];
  range: RangeKey;
  forecast: Pm25Forecast | null;
  /** Link for another range (so the page can keep its other query params). */
  hrefFor: (range: RangeKey) => string;
}) {
  const { hours, bucket, label } = RANGES[range];

  const chart = (field: MetricId) => {
    const c = CHARTS[field];
    let points: ChartPoint[] = series.map((p) => ({ t: p.t, v: DISPLAY_ORDER.map((r) => c.value(p.values[r])) }));
    // A daily-maximum chart has no room for an hourly forecast.
    const fromPm25 = bucket === "hour" ? c.fromPm25 : undefined;
    const forecasting = forecast != null && fromPm25 != null;
    if (forecasting) points = withForecast(points, forecast, hours, fromPm25);
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
    <div>
      <nav className="flex flex-wrap items-center gap-2" aria-label="Time range">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <Link
            key={k}
            href={hrefFor(k)}
            scroll={false}
            aria-current={k === range ? "page" : undefined}
            className={`text-sm ${pill(k === range)}`}
          >
            {RANGES[k].label}
          </Link>
        ))}
      </nav>
      <ByMetric views={{ aqi: chart("aqi"), pm25: chart("pm25"), psi: chart("psi") }} />
    </div>
  );
}
