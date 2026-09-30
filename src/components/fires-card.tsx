import { FIRE_AREAS, upwindArea, type Hotspots } from "@/lib/fires";
import type { Wind } from "@/lib/wind";
import { Card } from "./card";

const fmtDay = new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", day: "numeric", month: "short" });
const dayLabel = (day: string) => fmtDay.format(Date.parse(day));

/** Daily bars on a scale shared across areas, so the two regions compare at a glance. The last day is still in progress. */
function Bars({ values, days, max, name }: { values: number[]; days: string[]; max: number; name: string }) {
  const w = 100 / values.length;
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="mt-2 h-12 w-full"
      role="img"
      aria-label={`Daily hotspots in ${name}: ${values.map((v, i) => `${dayLabel(days[i])} ${v}`).join(", ")}`}
    >
      {values.map((v, i) => {
        const h = max ? (v / max) * 40 : 0;
        return (
          <rect
            key={days[i]}
            x={i * w + w * 0.15}
            width={w * 0.7}
            y={40 - Math.max(h, 0.6)}
            height={Math.max(h, 0.6)}
            rx={0.8}
            fill="var(--series-1)"
            opacity={i === values.length - 1 ? 0.4 : 1}
          >
            <title>{`${dayLabel(days[i])}: ${v.toLocaleString()}${i === values.length - 1 ? " so far" : ""}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Where the smoke comes from: satellite fire hotspots in Sumatra and Borneo, and whether today's wind carries it here. */
export function FiresCard({ hotspots, wind }: { hotspots: Hotspots | null; wind: Wind | null }) {
  const days = hotspots?.days ?? [];
  if (days.length < 2) return null;
  const complete = days.slice(0, -1); // the latest satellite day is still being observed
  const last = complete.at(-1)!;
  const max = Math.max(...days.flatMap((d) => Object.values(d.counts)));
  const upwind = wind ? upwindArea(wind.fromDeg) : undefined;

  return (
    <Card title="Where the smoke comes from" subtitle="Fire hotspots detected by satellite each day">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIRE_AREAS.map((area) => {
          const latest = last.counts[area.id];
          const before = complete.slice(-8, -1).map((d) => d.counts[area.id]);
          const avg = before.length ? Math.round(before.reduce((a, b) => a + b, 0) / before.length) : null;
          const ratio = avg ? latest / avg : null;
          return (
            <div key={area.id} className="rounded-lg border border-border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 text-sm font-medium">
                {area.name}
                {upwind === area && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[0.6875rem] font-normal text-ink-2">Upwind now</span>
                )}
              </div>
              <div className="mt-1">
                <span className="tabular text-2xl font-semibold">{latest.toLocaleString()}</span>
                <span className="ml-1.5 text-xs text-muted">on {dayLabel(last.day)}</span>
              </div>
              {avg != null && (
                <div className="text-xs text-ink-2">
                  {ratio! >= 1.5 ? "▲ Well above" : ratio! <= 0.67 ? "▼ Well below" : "About"} the previous {before.length}-day
                  average ({avg.toLocaleString()})
                </div>
              )}
              <Bars values={days.map((d) => d.counts[area.id])} days={days.map((d) => d.day)} max={max} name={area.name} />
            </div>
          );
        })}
      </div>

      {wind && (
        <p className="mt-3 text-sm">
          Wind now: from the {wind.compass}, {wind.speedKmh} km/h.{" "}
          <span className="text-ink-2">
            {upwind ? `It blows from ${upwind.name} toward Singapore.` : "It isn't blowing from either fire region."}
          </span>
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        NASA FIRMS, VIIRS on NOAA-20, nominal and high confidence. Days are satellite (UTC) days; the faded bar is today so
        far.
      </p>
    </Card>
  );
}
