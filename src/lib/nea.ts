// Client for NEA air-quality data published on data.gov.sg (v2 real-time API).
// Both endpoints publish hourly; `?date=YYYY-MM-DD` returns every hour of that SGT day.
import { nearestRegion } from "./geo";
import { fetchOk, num, str } from "./http";
import { emptyMeasures, endpointOf, MEASURE_KEYS, MEASURES, REGIONS, type Measures, type Region } from "./schema";

const BASE = "https://api-open.data.gov.sg/v2/real-time/api";

interface ApiItem {
  timestamp: string;
  updatedTimestamp?: string;
  readings: Record<string, Partial<Record<Region, number>>>;
}

interface ApiResponse<T> {
  code: number;
  errorMsg?: string;
  data?: T;
}

interface StationData {
  stations: { id: string; name: string; location: { latitude: number; longitude: number } }[];
  readings: { timestamp: string; data: { stationId: string; value: number }[] }[];
}

export type ReadingRow = { region: Region; observedAt: string; sourceUpdatedAt: string | null } & Measures;

async function getJson<T>(url: string): Promise<ApiResponse<T>> {
  const key = process.env.DATA_GOV_SG_API_KEY;
  const res = await fetchOk(url, { accept: "application/json", ...(key && { "x-api-key": key }) });
  const body = (await res.json()) as ApiResponse<T>;
  if (body.code !== 0) throw new Error(`data.gov.sg error for ${url}: ${body.errorMsg}`);
  return body;
}

async function fetchItems(endpoint: "psi" | "pm25", date?: string): Promise<ApiItem[]> {
  const items: ApiItem[] = [];
  let token: string | undefined;
  do {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (token) params.set("paginationToken", token);
    const qs = params.toString();
    const body = await getJson<{ items: ApiItem[]; paginationToken?: string }>(`${BASE}/${endpoint}${qs ? `?${qs}` : ""}`);
    items.push(...(body.data?.items ?? []));
    token = body.data?.paginationToken || undefined;
  } while (token);
  return items;
}

/** Fetches PSI + PM2.5 readings for one SGT date (or the latest hour if omitted). */
export async function fetchReadings(date?: string): Promise<ReadingRow[]> {
  const endpoints = ["psi", "pm25"] as const;
  const responses = await Promise.all(endpoints.map((e) => fetchItems(e, date)));

  const rows = new Map<string, ReadingRow>();
  endpoints.forEach((endpoint, i) => {
    const keys = MEASURE_KEYS.filter((k) => endpointOf(k) === endpoint);
    for (const item of responses[i]) {
      const observedAt = new Date(item.timestamp).toISOString();
      for (const region of REGIONS) {
        const id = `${region}|${observedAt}`;
        const row = rows.get(id) ?? { region, observedAt, sourceUpdatedAt: null, ...emptyMeasures() };
        rows.set(id, row);
        for (const k of keys) row[k] = num(item.readings[MEASURES[k].api]?.[region]);
        if (endpoint === "psi") row.sourceUpdatedAt = item.updatedTimestamp ?? null;
      }
    }
  });
  return [...rows.values()];
}

interface WindRow {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  observedAt: string;
  directionDeg: number | null;
  speedKnots: number | null;
}

/** Latest wind direction and speed for every weather station. */
export async function fetchWind(): Promise<WindRow[]> {
  const [dir, speed] = await Promise.all(
    (["wind-direction", "wind-speed"] as const).map((e) => getJson<StationData>(`${BASE}/${e}`).then((b) => b.data)),
  );
  const latest = (d?: StationData) => d?.readings[0];
  const valueOf = (d: StationData | undefined, id: string) => num(latest(d)?.data.find((x) => x.stationId === id)?.value);
  const ts = latest(dir)?.timestamp ?? latest(speed)?.timestamp;
  if (!ts) return [];
  const stations = new Map([...(dir?.stations ?? []), ...(speed?.stations ?? [])].map((s) => [s.id, s]));
  return [...stations.values()].map((s) => ({
    stationId: s.id,
    name: s.name,
    latitude: s.location.latitude,
    longitude: s.location.longitude,
    observedAt: new Date(ts).toISOString(),
    directionDeg: valueOf(dir, s.id),
    speedKnots: valueOf(speed, s.id),
  }));
}

export interface NeaForecast {
  /** Next-2-hour forecast for each of NEA's 47 areas. */
  twoHour: { validUntil: string; areas: { name: string; region: Region; forecast: string }[] } | null;
  /** 24-hour forecast: islandwide summary plus three periods of per-region weather. */
  day: {
    forecast: string;
    tempLow: number | null;
    tempHigh: number | null;
    periods: { start: string; end: string; regions: Partial<Record<Region, string>> }[];
  } | null;
  /** 4-day outlook, one entry per day. */
  outlook: { date: string; summary: string; tempLow: number | null; tempHigh: number | null }[];
}

type Temp = { low?: unknown; high?: unknown };
interface TwoHourData {
  area_metadata?: { name: string; label_location: { latitude: number; longitude: number } }[];
  items?: { valid_period?: { end?: string }; forecasts?: { area: string; forecast: string }[] }[];
}
interface DayData {
  records?: {
    general?: { forecast?: { text?: string }; temperature?: Temp };
    periods?: { timePeriod?: { start?: string; end?: string }; regions?: Record<string, { text?: string }> }[];
  }[];
}
interface OutlookData {
  records?: { forecasts?: { timestamp?: string; forecast?: { summary?: string; text?: string }; temperature?: Temp }[] }[];
}

/** Whether a 2-hour forecast ("Hazy", "Slightly Hazy") calls for haze. */
export const isHazy = (forecast: string) => /haz/i.test(forecast);

/** NEA's weather forecasts: next 2 hours by area, next 24 hours by region, and the next 4 days. */
export async function fetchNeaForecast(): Promise<NeaForecast> {
  const [two, day, outlook] = await Promise.all([
    getJson<TwoHourData>(`${BASE}/two-hr-forecast`).then((b) => b.data),
    getJson<DayData>(`${BASE}/twenty-four-hr-forecast`).then((b) => b.data),
    getJson<OutlookData>(`${BASE}/four-day-outlook`).then((b) => b.data),
  ]);

  const locations = new Map((two?.area_metadata ?? []).map((a) => [a.name, a.label_location]));
  const item = two?.items?.[0];
  const areas = (item?.forecasts ?? []).flatMap(({ area, forecast }) => {
    const at = locations.get(area);
    const [lat, lon] = [num(at?.latitude), num(at?.longitude)];
    return lat != null && lon != null && str(forecast) ? [{ name: str(area), region: nearestRegion(lat, lon), forecast }] : [];
  });

  const record = day?.records?.[0];
  const regionsOf = (r: Record<string, { text?: string }> = {}) =>
    Object.fromEntries(REGIONS.flatMap((k) => (str(r[k]?.text) ? [[k, str(r[k]?.text)]] : [])));

  return {
    twoHour: areas.length ? { validUntil: str(item?.valid_period?.end), areas } : null,
    day: record
      ? {
          forecast: str(record.general?.forecast?.text),
          tempLow: num(record.general?.temperature?.low),
          tempHigh: num(record.general?.temperature?.high),
          // NEA's period `text` is sometimes wrong (e.g. the wrong month), so only start/end are kept.
          periods: (record.periods ?? []).flatMap((p) =>
            p.timePeriod?.start && p.timePeriod.end
              ? [{ start: p.timePeriod.start, end: p.timePeriod.end, regions: regionsOf(p.regions) }]
              : [],
          ),
        }
      : null,
    outlook: (outlook?.records?.[0]?.forecasts ?? []).flatMap((f) =>
      f.timestamp
        ? [
            {
              date: f.timestamp.slice(0, 10),
              summary: str(f.forecast?.summary) || str(f.forecast?.text),
              tempLow: num(f.temperature?.low),
              tempHigh: num(f.temperature?.high),
            },
          ]
        : [],
    ),
  };
}
