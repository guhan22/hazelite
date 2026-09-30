import { bandFor, PM25_BANDS } from "@/lib/bands";
import { forecastMax, type Pm25Forecast } from "@/lib/forecast";
import { sgtFormat } from "@/lib/format";
import { isHazy, type NeaForecast } from "@/lib/nea";
import { mostCommon } from "@/lib/summary";
import { DAY, sgtDayStart } from "@/lib/time";
import { StatusLabel } from "./status";
import { Card } from "./card";

const fmtTime = sgtFormat({ hour: "numeric", minute: "2-digit" });
const fmtWeekday = sgtFormat({ weekday: "short" });
const fmtHour = sgtFormat({ hour: "numeric", hourCycle: "h23" });

/** e.g. "Wed night", "Thu morning". */
function periodLabel(start: number) {
  const h = Number(fmtHour.format(start));
  return `${fmtWeekday.format(start)} ${h < 6 ? "early" : h < 12 ? "morning" : h < 18 ? "afternoon" : "night"}`;
}

/** Model PM2.5 with its NEA band, or a dash beyond the model's horizon. */
function ModelPm25({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted">PM2.5 –</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-2">
      PM2.5 up to <strong className="tabular font-semibold text-ink">{value}</strong>
      <StatusLabel band={bandFor(PM25_BANDS, value)} />
    </span>
  );
}

/** What's coming: NEA's 2-hour, 24-hour and 4-day forecasts, each paired with the model's PM2.5. */
export function OutlookCard({ nea, model, now }: { nea: NeaForecast | null; model: Pm25Forecast | null; now: number }) {
  if (!nea) return null;
  const { twoHour, day, outlook } = nea;
  const hazy = twoHour?.areas.filter((a) => isHazy(a.forecast)) ?? [];

  return (
    <Card title="Outlook" subtitle="NEA's weather forecast, with a model forecast of PM2.5 for Singapore">
      {twoHour && (
        <p className="text-sm">
          <span className="text-muted">Next 2 hours: </span>
          {hazy.length > 0 ? (
            <strong className="font-semibold">
              Hazy in {hazy.length} of {twoHour.areas.length} areas
            </strong>
          ) : (
            <>Mostly {mostCommon(twoHour.areas.map((a) => a.forecast))?.toLowerCase()}, no haze forecast</>
          )}
          {twoHour.validUntil && <span className="text-xs text-muted"> · until {fmtTime.format(Date.parse(twoHour.validUntil))}</span>}
        </p>
      )}
      {hazy.length > 0 && <p className="mt-0.5 text-xs text-ink-2">{hazy.map((a) => a.name).join(", ")}</p>}

      {day && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          {day.periods
            .map((p) => ({ ...p, from: Date.parse(p.start), to: Date.parse(p.end) }))
            .filter((p) => p.to > now)
            .map((p) => (
              <li key={p.start} className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted">{periodLabel(p.from)}</div>
                <div className="text-sm">{mostCommon(Object.values(p.regions)) ?? "–"}</div>
                <ModelPm25 value={forecastMax(model, Math.max(p.from, now), p.to)} />
              </li>
            ))}
        </ul>
      )}

      {outlook.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">Four-day outlook</caption>
          <tbody>
            {outlook.map((d) => {
              const from = sgtDayStart(Date.parse(`${d.date}T12:00:00+08:00`));
              return (
                <tr key={d.date} className="border-t border-border">
                  <th scope="row" className="w-12 py-2 text-left font-medium">
                    {fmtWeekday.format(from)}
                  </th>
                  <td className="py-2 text-ink-2">{d.summary}</td>
                  <td className="tabular whitespace-nowrap py-2 text-right text-xs text-muted">
                    {d.tempLow ?? "–"}–{d.tempHigh ?? "–"}°C
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <ModelPm25 value={forecastMax(model, from, from + DAY)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="mt-3 text-xs text-muted">
        PM2.5 values are a computer-model forecast (CAMS, via Open-Meteo) for Singapore as a whole. Treat them as a trend,
        not a reading.
      </p>
    </Card>
  );
}
