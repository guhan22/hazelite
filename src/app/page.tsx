import { after } from "next/server";
import { AutoRefresh } from "@/components/auto-refresh";
import { FiresCard } from "@/components/fires-card";
import { HistoryCard } from "@/components/history-card";
import { MetricProvider } from "@/components/metric-toggle";
import { NewsCard } from "@/components/news-card";
import { OutdoorPlanner } from "@/components/outdoor-planner";
import { OutlookCard } from "@/components/outlook-card";
import { PollutantTable } from "@/components/pollutant-table";
import { RegionExplorer } from "@/components/region-explorer";
import { Notice, Shell } from "@/components/shell";
import { StatusLabel } from "@/components/status";
import { TrendSection } from "@/components/trend-section";
import { advisoryFor, bandFor, PM25_BANDS, PSI_BANDS, type Band } from "@/lib/bands";
import { getDashboard } from "@/lib/dashboard";
import { forecastMax } from "@/lib/forecast";
import { titleCase } from "@/lib/format";
import { isHazy } from "@/lib/nea";
import { parseRange } from "@/lib/queries";
import { refreshIfStale } from "@/lib/refresh";
import { DISPLAY_ORDER, REGIONS, type Region } from "@/lib/schema";
import { formatRange, range, worstRegion } from "@/lib/summary";
import { HOUR, sgtDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const rangeKey = parseRange((await searchParams).range);
  // Once the response is sent, pull fresh data if it has gone stale.
  after(refreshIfStale);

  let data: Awaited<ReturnType<typeof getDashboard>>;
  try {
    data = await getDashboard(rangeKey);
  } catch {
    return (
      <Notice title="Can't reach the database.">
        Start Postgres with <code className="rounded bg-grid px-1">npm run db:up</code>, check <code className="rounded bg-grid px-1">DATABASE_URL</code> in{" "}
        <code className="rounded bg-grid px-1">.env</code>, then reload.
      </Notice>
    );
  }
  const { latest, series, refreshFailed, wind, replay, feeds, psiDayAgo, history } = data;

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
  const pmBand = bandFor(PM25_BANDS, pm25?.max);
  const delta = psi && psiDayAgo != null ? psi.max - psiDayAgo : null;
  const worst = worstRegion(latest)!;
  const byRegion = new Map(latest.map((r) => [r.region, r]));
  const inOrder = (order: readonly Region[]) => order.flatMap((r) => byRegion.get(r) ?? []);

  const { neaForecast, pm25Forecast, hotspots, news } = feeds;
  const hazeSoon = [...new Set(neaForecast?.twoHour?.areas.filter((a) => isHazy(a.forecast)).map((a) => a.region))];
  const tomorrow = sgtDayStart(observedAt.getTime(), 1);
  const tomorrowPm25 = forecastMax(pm25Forecast, tomorrow + 7 * HOUR, tomorrow + 19 * HOUR);
  const elevated = [psiBand, pmBand].some((b) => b && b.severity !== "good");

  return (
    <Shell observedAt={observedAt} refreshFailed={refreshFailed}>
      <AutoRefresh />
      <MetricProvider>
        {/* relative + overflow-hidden: the explorer's haze overlay fills and clips to this card. */}
        <section className="relative grid gap-6 overflow-hidden rounded-xl border border-border bg-surface p-5 sm:p-6 lg:grid-cols-[minmax(0,25rem)_1fr]">
          <RegionExplorer readings={inOrder(REGIONS)} replay={replay} wind={wind} hazeSoon={hazeSoon} />

          <div className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Headline title="Right now · 1-hr PM2.5" value={formatRange(pm25)} unit="µg/m³" band={pmBand} />
              <Headline title="24-hr PSI" value={formatRange(psi)} band={psiBand} />
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <h3 className="mb-2 text-sm font-medium text-ink-2">
                  Health advisory <span className="font-normal text-muted">· 24-hr PSI, for planning ahead</span>
                </h3>
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

        <OutdoorPlanner readings={latest} tomorrow={tomorrowPm25} />

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
          <OutlookCard nea={neaForecast} model={pm25Forecast} now={observedAt.getTime()} />
          <FiresCard hotspots={hotspots} wind={wind.islandwide} />
        </div>

        <TrendSection series={series} range={rangeKey} forecast={pm25Forecast} />
      </MetricProvider>

      <NewsCard items={news} open={elevated} />
      <PollutantTable readings={inOrder(DISPLAY_ORDER)} observedAt={observedAt} />
    </Shell>
  );
}

function Headline({ title, value, unit, band }: { title: string; value: string; unit?: string; band: Band | null }) {
  return (
    <div>
      <h2 className="text-sm font-medium text-ink-2">{title}</h2>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-5xl font-semibold tracking-tight">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      <StatusLabel band={band} className="mt-1 text-base font-medium" />
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">
        <span className="text-2xl font-semibold">{value}</span>
        <div className="mt-1 text-xs text-ink-2">{children}</div>
      </dd>
    </div>
  );
}
