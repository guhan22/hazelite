import { fetchOk } from "./http";
import { DAY } from "./time";

type Point = readonly [lon: number, lat: number];

/**
 * The fire regions that send haze to Singapore, as rough coastal outlines (lon, lat) so that fires in
 * Peninsular Malaysia, Java or Singapore itself aren't counted. `windFrom` is the range of wind
 * directions (degrees, blowing from) that carries their smoke here.
 */
export const FIRE_AREAS = [
  {
    id: "sumatra",
    name: "Sumatra",
    windFrom: [180, 270],
    outline: [
      [95.0, 5.9], [97.6, 5.4], [98.9, 3.9], [100.4, 2.6], [101.4, 2.2], [102.3, 1.7], [103.5, 0.9], [104.0, 0.0],
      [104.6, -1.0], [105.6, -1.4], [106.9, -2.2], [106.8, -3.2], [106.0, -3.4], [106.1, -4.5], [105.9, -6.0],
      [104.4, -6.0], [103.3, -5.0], [101.6, -3.9], [100.0, -1.0], [99.0, 0.5], [98.0, 2.0], [96.9, 3.2], [95.9, 4.1],
      [95.0, 5.2],
    ],
  },
  {
    id: "borneo",
    name: "Borneo",
    windFrom: [80, 160],
    outline: [
      [109.6, 2.0], [111.0, 2.6], [113.0, 3.3], [114.5, 4.7], [115.4, 5.5], [116.7, 7.1], [117.8, 6.5], [119.3, 5.4],
      [118.0, 4.3], [117.9, 2.0], [119.0, 1.0], [117.6, 0.0], [117.0, -1.0], [116.6, -2.0], [116.4, -3.8], [114.6, -4.2],
      [113.0, -3.4], [111.8, -3.6], [110.1, -3.0], [110.0, -1.8], [109.0, -0.8], [108.8, 1.0],
    ],
  },
] as const satisfies readonly { id: string; name: string; windFrom: readonly [number, number]; outline: readonly Point[] }[];

export type FireAreaId = (typeof FIRE_AREAS)[number]["id"];
type FireArea = (typeof FIRE_AREAS)[number];

/** Daily hotspot counts per area, oldest first. Days are UTC satellite dates. */
export interface Hotspots {
  days: { day: string; counts: Record<FireAreaId, number> }[];
}

// NOAA-20 VIIRS, near real time: one instrument, so counts are consistent from day to day.
const SOURCE = "VIIRS_NOAA20_NRT";
const BBOX = "94.9,-6.3,119.5,7.5";
const DAYS_PER_FETCH = 5; // the most FIRMS returns per request
const DAYS_KEPT = 14;

/** Ray-casting point-in-polygon test. */
function inside([x, y]: Point, outline: readonly Point[]) {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i];
    const [xj, yj] = outline[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const zero = () => Object.fromEntries(FIRE_AREAS.map((a) => [a.id, 0])) as Record<FireAreaId, number>;
const utcDate = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

/** Counts nominal- and high-confidence detections per area per day in a FIRMS VIIRS CSV. */
function countHotspots(csv: string, days: string[]): Hotspots["days"] {
  const [header = "", ...lines] = csv.trim().split("\n");
  const cols = header.split(",");
  const [lat, lon, date, confidence] = ["latitude", "longitude", "acq_date", "confidence"].map((c) => cols.indexOf(c));
  // An invalid key or a limit error comes back as plain text rather than CSV.
  if ([lat, lon, date, confidence].includes(-1)) throw new Error("FIRMS returned an unexpected response");

  const byDay = new Map(days.map((d) => [d, zero()]));
  for (const line of lines) {
    const f = line.split(",");
    if (f[confidence] === "l") continue; // low confidence: often sun glint or hot surfaces, not fires
    const area = FIRE_AREAS.find((a) => inside([Number(f[lon]), Number(f[lat])], a.outline));
    const counts = byDay.get(f[date]);
    if (area && counts) counts[area.id]++;
  }
  return [...byDay].map(([day, counts]) => ({ day, counts }));
}

/** Fetches the last five days of hotspots and merges them into the stored history. */
export async function fetchHotspots(previous: Hotspots | null): Promise<Hotspots> {
  const key = encodeURIComponent(process.env.FIRMS_MAP_KEY ?? "");
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${SOURCE}/${BBOX}/${DAYS_PER_FETCH}`;
  const days = Array.from({ length: DAYS_PER_FETCH }, (_, i) => utcDate(DAYS_PER_FETCH - 1 - i));
  const fresh = countHotspots(await (await fetchOk(url)).text(), days);
  const merged = new Map([...(previous?.days ?? []), ...fresh].map((d) => [d.day, d]));
  return { days: [...merged.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-DAYS_KEPT) };
}

/** The fire area whose smoke the given wind (blowing from `fromDeg`) carries toward Singapore. */
export const upwindArea = (fromDeg: number): FireArea | undefined =>
  FIRE_AREAS.find(({ windFrom: [lo, hi] }) => fromDeg >= lo && fromDeg <= hi);
