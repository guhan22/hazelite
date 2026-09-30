import Link from "next/link";
import { after } from "next/server";
import { AutoRefresh } from "@/components/auto-refresh";
import { HistoryCard } from "@/components/history-card";
import { OutdoorPlanner } from "@/components/outdoor-planner";
import { PollutantTable, ReadingsTable } from "@/components/readings-tables";
import { RegionExplorer } from "@/components/region-explorer";
import { Notice, Shell } from "@/components/shell";
import { StatusLabel } from "@/components/status";
import { TrendChart, type ChartSeries } from "@/components/trend-chart";
import { advisoryFor, bandFor, PM25_BANDS, PSI_BANDS, thresholdsFor, type Band } from "@/lib/bands";
import { titleCase } from "@/lib/format";
import {
  getHistoryContext,
  getLatest,
  getLatestWind,
  getNationalPsiAt,
  getSeries,
  lastIngestFailed,
  parseRange,
  RANGES,
  type LatestReading,
} from "@/lib/queries";
import { refreshIfStale } from "@/lib/refresh";
import { REGIONS, type Region } from "@/lib/schema";
import { formatRange, range, worstRegion } from "@/lib/summary";

export const dynamic = "force-dynamic";

const REGION_ORDER: Region[] = ["central", "north", "south", "east", "west"];
const SERIES: ChartSeries[] = REGION_ORDER.map((r, i) => ({ key: r, label: titleCase(r), color: `var(--series-${i + 1})` }));

const CHARTS: { field: "psi" | "pm25"; title: string; subtitle: string; unit: string; bands: Band[] }[] = [
  { field: "psi", title: "24-hr PSI by region", subtitle: "Rolling 24-hour Pollutant Standards Index", unit: "24-hr PSI", bands: PSI_BANDS },
  { field: "pm25", title: "1-hr PM2.5 by region", subtitle: "Hourly fine particulate concentration, µg/m³", unit: "µg/m³", bands: PM25_BANDS },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const rangeKey = parseRange((await searchParams).range);
  // Once the response is sent, pull fresh readings from NEA if the data has gone stale.
  after(refreshIfStale);
  const { hours, bucket, label: rangeLabel } = RANGES[rangeKey];

  let latest: LatestReading[], series: Awaited<ReturnType<typeof getSeries>>, refreshFailed: boolean;
  let wind: Awaited<ReturnType<typeof getLatestWind>>;
  try {
    [latest, series, refreshFailed, wind] = await Promise.all([
      getLatest(),
      getSeries(hours, bucket),
      lastIngestFailed(),
      // Wind is a nice-to-have: without it the dashboard still renders.
      getLatestWind().catch(() => ({ islandwide: null, byRegion: {} })),
    ]);
  } catch {
    return (
      <Notice title="Can't reach the database.">
        Start Postgres with <code className="rounded bg-grid px-1">npm run db:up</code>, check <code className="rounded bg-grid px-1">DATABASE_URL</code> in{" "}
        <code className="rounded bg-grid px-1">.env</code>, then reload.
      </Notice>
    );
  }

  if (latest.length === 0) {
    return (
      <Notice title="Waiting for the first readings from NEA…">
        <AutoRefresh seconds={20} />
        This page refreshes automatically{refreshFailed && "; the last attempt failed and will be retried"}.
      </Notice>
    );
  }

  const observedAt = latest[0].observedAt;
  const psi = range(latest.map((r) => r.psi24h));
  const pm25 = range(latest.map((r) => r.pm25_1h));
  const psiBand = bandFor(PSI_BANDS, psi?.max);
  const [psiDayAgo, history] = await Promise.all([
    getNationalPsiAt(observedAt, 24),
    psi ? getHistoryContext(observedAt, psi.max) : null,
  ]);
  const delta = psi && psiDayAgo != null ? psi.max - psiDayAgo : null;
  const worst = worstRegion(latest)!;
  const byRegion = new Map(latest.map((r) => [r.region, r]));
  const inOrder = (order: readonly Region[]) => order.flatMap((r) => byRegion.get(r) ?? []);

  return (
    <Shell observedAt={observedAt} refreshFailed={refreshFailed}>
      <AutoRefresh />

      <section className="grid gap-6 rounded-xl border border-border bg-surface p-5 sm:p-6 lg:grid-cols-[minmax(0,25rem)_1fr]">
        <RegionExplorer readings={inOrder(REGIONS)} wind={wind} />

        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-sm font-medium text-ink-2">24-hr PSI, islandwide</h2>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span className="text-6xl font-semibold tracking-tight">{formatRange(psi)}</span>
              <StatusLabel band={psiBand} className="text-lg font-medium" />
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="1-hr PM2.5" value={formatRange(pm25)} unit="µg/m³">
              <StatusLabel band={bandFor(PM25_BANDS, pm25?.max)} />
            </Stat>
            <Stat label="Highest region" value={titleCase(worst.region)}>
              PSI {worst.psi24h ?? "–"}
            </Stat>
            <Stat label="Change vs 24 hrs ago" value={delta == null ? "–" : `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)}`}>
              <span style={{ color: !delta ? "var(--muted)" : delta > 0 ? "var(--delta-bad)" : "var(--delta-good)" }}>
                {delta == null ? "No data" : delta > 0 ? "▲ Worsening" : delta < 0 ? "▼ Improving" : "Unchanged"}
              </span>
            </Stat>
          </dl>

          {psiBand && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-ink-2">Health advisory</h3>
              <ul className="grid gap-2 sm:grid-cols-3">
                {advisoryFor(psiBand.severity).map((a) => (
                  <li key={a.group} className="rounded-lg border border-border px-3 py-2">
                    <div className="text-xs text-muted">{a.group}</div>
                    <div className="text-sm">{a.advice}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {psi && history && <HistoryCard psi={psi.max} at={observedAt} history={history} />}
        </div>
      </section>

      <OutdoorPlanner readings={latest} />

      <nav className="mt-8 flex flex-wrap items-center gap-2" aria-label="Time range">
        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
          <Link
            key={k}
            href={`/?range=${k}`}
            scroll={false}
            aria-current={k === rangeKey ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              k === rangeKey ? "border-ink bg-ink text-page" : "border-border bg-surface text-ink-2 hover:bg-grid"
            }`}
          >
            {RANGES[k].label}
          </Link>
        ))}
      </nav>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {CHARTS.map((c) => (
          <section key={c.field} className="min-w-0 rounded-xl border border-border bg-surface p-5">
            <h2 className="text-base font-semibold">{c.title}</h2>
            <p className="mb-3 text-xs text-muted">
              {c.subtitle}
              {bucket === "day" && " · daily maximum"}
            </p>
            <TrendChart
              series={SERIES}
              points={series.map((p) => ({ t: p.t, v: REGION_ORDER.map((r) => p.values[r]?.[c.field] ?? null) }))}
              unit={c.unit}
              ariaLabel={`${c.title} over the last ${rangeLabel}`}
              bucket={bucket}
              thresholds={thresholdsFor(c.bands)}
            />
          </section>
        ))}
      </div>

      <ReadingsTable series={series} regions={REGION_ORDER} bucket={bucket} />
      <PollutantTable readings={inOrder(REGION_ORDER)} observedAt={observedAt} />
    </Shell>
  );
}

function Stat({ label, value, unit, children }: { label: string; value: string; unit?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">
        <span className="text-2xl font-semibold">{value}</span>
        {unit && <span className="ml-1 text-xs text-muted">{unit}</span>}
        <div className="mt-1 text-xs text-ink-2">{children}</div>
      </dd>
    </div>
  );
}
