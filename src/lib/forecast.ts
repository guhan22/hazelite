import { fetchOk, num } from "./http";

/** Hourly surface PM2.5 (µg/m³) from the CAMS global model, for the grid cell over Singapore. */
export interface Pm25Forecast {
  points: { t: number; v: number }[];
}

// Central Singapore. At CAMS's ~45 km resolution this one cell stands for the whole island.
const FORECAST_URL =
  "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=1.35&longitude=103.82" +
  "&hourly=pm2_5&forecast_days=5&timezone=GMT&timeformat=unixtime";

export async function fetchPm25Forecast(): Promise<Pm25Forecast> {
  const body = (await (await fetchOk(FORECAST_URL)).json()) as { hourly?: { time?: unknown[]; pm2_5?: unknown[] } };
  const values = body.hourly?.pm2_5 ?? [];
  const points = (body.hourly?.time ?? []).flatMap((time, i) => {
    const [t, v] = [num(time), num(values[i])];
    return t != null && v != null && v >= 0 ? [{ t: t * 1000, v: Math.round(v) }] : [];
  });
  if (points.length === 0) throw new Error("open-meteo returned no PM2.5 forecast");
  return { points };
}

/** Highest forecast value in [from, to), or null when the forecast doesn't cover that window. */
export function forecastMax(f: Pm25Forecast | null, from: number, to: number): number | null {
  const v = (f?.points ?? []).filter((p) => p.t >= from && p.t < to).map((p) => p.v);
  return v.length ? Math.max(...v) : null;
}
