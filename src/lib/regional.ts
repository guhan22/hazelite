import { fetchOk, num } from "./http";
import { HOUR } from "./time";

/**
 * The regional grid behind the haze map: a point every 2° from 86–122°E and 12°S–16°N, so Singapore
 * sits near the middle with Sumatra, Borneo and the Mekong all in reach. Points run west to east, then
 * south to north.
 */
export const GRID = { lon0: 86, lat0: -12, step: 2, nx: 19, ny: 15 } as const;

/** Wind and model smoke across the grid, every few hours from two days ago to two days ahead. */
export interface RegionalWeather {
  /** Epoch ms of the first frame. */
  t0: number;
  stepHours: number;
  /**
   * One entry per frame, each a value per grid point: wind at 925 hPa (about 2,500 ft, the level NEA's
   * haze maps use) as eastward `u` and northward `v` in km/h, and surface PM2.5 `pm` in µg/m³.
   */
  frames: { u: number[]; v: number[]; pm: number[] }[];
}

const STEP_HOURS = 3;
const POINTS = Array.from({ length: GRID.nx * GRID.ny }, (_, k) => ({
  lon: GRID.lon0 + (k % GRID.nx) * GRID.step,
  lat: GRID.lat0 + Math.floor(k / GRID.nx) * GRID.step,
}));
const QUERY =
  `latitude=${POINTS.map((p) => p.lat).join(",")}&longitude=${POINTS.map((p) => p.lon).join(",")}` +
  "&past_days=2&forecast_days=3&timezone=GMT&timeformat=unixtime";
const WIND_URL = `https://api.open-meteo.com/v1/forecast?${QUERY}&hourly=wind_speed_925hPa,wind_direction_925hPa`;
const SMOKE_URL = `https://air-quality-api.open-meteo.com/v1/air-quality?${QUERY}&hourly=pm2_5`;

type Hourly = { hourly?: Record<string, unknown[] | undefined> }[];

/** Fetches every grid point in one request per API (Open-Meteo returns one result per point, in order). */
async function fetchGrid(url: string): Promise<Hourly> {
  const body: unknown = await (await fetchOk(url)).json();
  if (!Array.isArray(body) || body.length !== POINTS.length) throw new Error("open-meteo returned an unexpected grid");
  return body as Hourly;
}

export async function fetchRegionalWeather(): Promise<RegionalWeather> {
  const [wind, smoke] = await Promise.all([fetchGrid(WIND_URL), fetchGrid(SMOKE_URL)]);
  const times = (wind[0].hourly?.time ?? []).map((t) => (num(t) ?? 0) * 1000);
  const smokeTimes = new Map((smoke[0].hourly?.time ?? []).map((t, i) => [(num(t) ?? 0) * 1000, i]));
  const now = Date.now();
  const frames: RegionalWeather["frames"] = [];
  let t0 = 0;
  times.forEach((t, i) => {
    if (t % (STEP_HOURS * HOUR) || t < now - 48 * HOUR || t > now + 48 * HOUR) return;
    t0 ||= t;
    const j = smokeTimes.get(t);
    const frame: RegionalWeather["frames"][number] = { u: [], v: [], pm: [] };
    POINTS.forEach((_, k) => {
      const speed = num(wind[k].hourly?.wind_speed_925hPa?.[i]) ?? 0;
      const from = ((num(wind[k].hourly?.wind_direction_925hPa?.[i]) ?? 0) * Math.PI) / 180;
      // Blowing from `from` means moving toward the opposite bearing.
      frame.u.push(Math.round(-speed * Math.sin(from)));
      frame.v.push(Math.round(-speed * Math.cos(from)));
      frame.pm.push(Math.max(0, Math.round((j == null ? null : num(smoke[k].hourly?.pm2_5?.[j])) ?? 0)));
    });
    frames.push(frame);
  });
  if (frames.length < 2) throw new Error("open-meteo returned no regional wind");
  return { t0, stepHours: STEP_HOURS, frames };
}
