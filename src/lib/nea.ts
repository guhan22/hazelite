// Client for NEA air-quality data published on data.gov.sg (v2 real-time API).
// Both endpoints publish hourly; `?date=YYYY-MM-DD` returns every hour of that SGT day.
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function getJson<T>(url: string, attempt = 0): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.DATA_GOV_SG_API_KEY) headers["x-api-key"] = process.env.DATA_GOV_SG_API_KEY;

  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(2 ** attempt * 2000);
    return getJson<T>(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`data.gov.sg ${res.status} for ${url}`);
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

export interface WindRow {
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

/** YYYY-MM-DD in Singapore time, `daysAgo` days before now. */
export function sgtDate(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(d);
}
