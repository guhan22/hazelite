// How air and smoke move across the haze map: the regional grid sampled at any place and time, air
// paths traced along the 2,500 ft wind, and the fire clusters ("epicentres") that matter most.

import type { FireMap } from "./fires";
import { GRID, type RegionalWeather } from "./regional";
import { HOUR } from "./time";

export const SINGAPORE = { lon: 103.82, lat: 1.35 };

export interface LonLat {
  lon: number;
  lat: number;
}

/** The grid's values at one moment: frames blended in time, one value per grid point. */
export interface Field {
  u: Float32Array;
  v: Float32Array;
  pm: Float32Array;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const toRad = (d: number) => (d * Math.PI) / 180;

/** First and last frame times (epoch ms). */
export const timeSpan = (w: RegionalWeather) => [w.t0, w.t0 + (w.frames.length - 1) * w.stepHours * HOUR] as const;

/** The grid at time `t`, linearly between the two nearest frames (clamped to the forecast's span). */
export function fieldAt(w: RegionalWeather, t: number): Field {
  const f = clamp((t - w.t0) / (w.stepHours * HOUR), 0, w.frames.length - 1);
  const i = Math.min(Math.floor(f), w.frames.length - 2);
  const k = f - i;
  const [a, b] = [w.frames[i], w.frames[i + 1]];
  const mix = (x: number[], y: number[]) => Float32Array.from(x, (v, j) => v + (y[j] - v) * k);
  return { u: mix(a.u, b.u), v: mix(a.v, b.v), pm: mix(a.pm, b.pm) };
}

/** Bilinear interpolation of one layer of a field; null off the grid. */
export function valueAt(layer: Float32Array, lon: number, lat: number): number | null {
  const fx = (lon - GRID.lon0) / GRID.step;
  const fy = (lat - GRID.lat0) / GRID.step;
  if (!(fx >= 0 && fy >= 0 && fx <= GRID.nx - 1 && fy <= GRID.ny - 1)) return null;
  const x = Math.min(Math.floor(fx), GRID.nx - 2);
  const y = Math.min(Math.floor(fy), GRID.ny - 2);
  const [dx, dy] = [fx - x, fy - y];
  const k = y * GRID.nx + x;
  const bottom = layer[k] + (layer[k + 1] - layer[k]) * dx;
  const top = layer[k + GRID.nx] + (layer[k + GRID.nx + 1] - layer[k + GRID.nx]) * dx;
  return bottom + (top - bottom) * dy;
}

/** Degrees of longitude and latitude covered in an hour by a wind of (u, v) km/h at `lat`. */
export const degPerHour = (u: number, v: number, lat: number) => [u / (111.32 * Math.cos(toRad(lat))), v / 110.57] as const;

export interface PathPoint extends LonLat {
  t: number;
}

/**
 * Where air at `start` at time `t` goes over `hours` (or, with `direction` -1, where it came from),
 * following the 2,500 ft wind in half-hour midpoint steps. Points are hourly, and the path stops at the
 * edge of the grid or of the forecast. A rough guide: real smoke also rises, sinks and rains out.
 */
export function tracePath(w: RegionalWeather, start: LonLat, t: number, hours: number, direction: 1 | -1 = 1): PathPoint[] {
  const [first, last] = timeSpan(w);
  const points: PathPoint[] = [{ ...start, t }];
  let { lon, lat } = start;
  const fields = new Map<number, Field>(); // half-hourly fields, reused by both midpoint samples
  const field = (time: number) => {
    let f = fields.get(time);
    if (!f) fields.set(time, (f = fieldAt(w, time)));
    return f;
  };
  const wind = (f: Field, lo: number, la: number) => {
    const [u, v] = [valueAt(f.u, lo, la), valueAt(f.v, lo, la)];
    return u == null || v == null ? null : degPerHour(u, v, la);
  };
  const dt = 0.5 * direction;
  for (let step = 1; step <= hours * 2; step++) {
    const now = t + (step - 1) * dt * HOUR;
    const next = now + dt * HOUR;
    if (next < first || next > last) break;
    const a = wind(field(now), lon, lat);
    if (!a) break;
    const mid = wind(field(now + (dt / 2) * HOUR), lon + a[0] * (dt / 2), lat + a[1] * (dt / 2));
    if (!mid) break;
    lon += mid[0] * dt;
    lat += mid[1] * dt;
    if (step % 2 === 0) points.push({ lon, lat, t: next });
  }
  return points;
}

/** Distance in km (equirectangular: plenty for a few thousand km near the equator). */
export function kmBetween(a: LonLat, b: LonLat) {
  const x = (b.lon - a.lon) * Math.cos(toRad((a.lat + b.lat) / 2));
  return 111.2 * Math.hypot(x, b.lat - a.lat);
}

/** Compass bearing from `a` to `b`, degrees clockwise from north. */
export function bearing(a: LonLat, b: LonLat) {
  const x = (b.lon - a.lon) * Math.cos(toRad((a.lat + b.lat) / 2));
  return ((Math.atan2(x, b.lat - a.lat) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
export const compassWord = (deg: number) => COMPASS[Math.round(deg / 45) % 8];

/**
 * Rough centres of the provinces and countries the map shows, plus the fire-prone districts within them,
 * for naming places ("around Riau").
 */
const PLACES: [name: string, lon: number, lat: number][] = [
  ["Singapore", 103.82, 1.35],
  ["Aceh", 96.9, 4.4],
  ["North Sumatra", 99.1, 2.2],
  ["Riau", 101.8, 0.4],
  ["Riau Islands", 104.5, 0.9],
  ["West Sumatra", 100.5, -0.8],
  ["Jambi", 103.0, -1.7],
  ["Bengkulu", 102.3, -3.6],
  ["South Sumatra", 104.2, -3.3],
  ["Lampung", 105.1, -4.8],
  ["Bangka Belitung", 106.6, -2.5],
  ["Pekanbaru, Riau", 101.45, 0.5],
  ["Pelalawan, Riau", 102.4, 0.1],
  ["Dumai, Riau", 101.4, 1.6],
  ["Palembang, South Sumatra", 104.75, -3.0],
  ["Ogan Komering Ilir, South Sumatra", 105.5, -3.4],
  ["Muaro Jambi, Jambi", 103.8, -1.4],
  ["West Kalimantan", 110.6, -0.1],
  ["Central Kalimantan", 113.4, -1.6],
  ["South Kalimantan", 115.3, -3.0],
  ["East Kalimantan", 116.3, 0.6],
  ["North Kalimantan", 116.4, 3.0],
  ["Pontianak, West Kalimantan", 109.3, 0.0],
  ["Ketapang, West Kalimantan", 110.4, -1.9],
  ["Kotawaringin, Central Kalimantan", 111.8, -2.4],
  ["Palangka Raya, Central Kalimantan", 113.9, -2.2],
  ["Banjarmasin, South Kalimantan", 114.6, -3.3],
  ["Kuching, Sarawak", 110.3, 1.55],
  ["Sarawak", 112.8, 2.5],
  ["Sabah", 117.0, 5.3],
  ["Brunei", 114.7, 4.5],
  ["Johor", 103.4, 2.0],
  ["Pahang", 102.8, 3.8],
  ["Selangor", 101.5, 3.2],
  ["Perak", 101.0, 4.6],
  ["Terengganu", 102.9, 5.0],
  ["Kedah", 100.6, 6.0],
  ["Java", 110.0, -7.3],
  ["Bali", 115.1, -8.4],
  ["Nusa Tenggara", 118.5, -8.7],
  ["Sulawesi", 120.5, -2.0],
  ["Southern Thailand", 100.0, 8.5],
  ["Thailand", 101.0, 14.5],
  ["Cambodia", 104.9, 12.6],
  ["Southern Vietnam", 106.5, 11.0],
  ["Myanmar", 98.5, 13.5],
  ["Palawan", 118.7, 9.6],
];

/** The nearest named place within ~250 km, or null out at sea. */
export function placeNear(p: LonLat): string | null {
  let best: string | null = null;
  let bestKm = 250;
  for (const [name, lon, lat] of PLACES) {
    const km = kmBetween(p, { lon, lat });
    if (km < bestKm) [best, bestKm] = [name, km];
  }
  return best;
}

/** Fire cells binned by whole degree, so neighbourhood sums only look at the 3×3 bins around a point. */
function binCells(cells: FireMap["cells"]) {
  const bins = new Map<string, FireMap["cells"]>();
  for (const c of cells) {
    const key = `${Math.floor(c[0])},${Math.floor(c[1])}`;
    const bin = bins.get(key);
    if (bin) bin.push(c);
    else bins.set(key, [c]);
  }
  return (p: LonLat, km: number, visit: (c: FireMap["cells"][number]) => void) => {
    const [bx, by] = [Math.floor(p.lon), Math.floor(p.lat)];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const c of bins.get(`${bx + dx},${by + dy}`) ?? []) if (kmBetween(p, { lon: c[0], lat: c[1] }) <= km) visit(c);
  };
}

/** Detections within `km` of any point of a path. */
export function firesAlong(cells: FireMap["cells"], path: LonLat[], km = 40): number {
  const near = binCells(cells);
  const seen = new Set<FireMap["cells"][number]>();
  for (const p of path) near(p, km, (c) => seen.add(c));
  return [...seen].reduce((n, c) => n + c[2], 0);
}

/** Detections within `km` of a point, with the strongest FRP and latest time among them. */
export function firesNear(cells: FireMap["cells"], p: LonLat, km: number) {
  let count = 0;
  let frp = 0;
  let t = 0;
  binCells(cells)(p, km, (c) => {
    count += c[2];
    frp = Math.max(frp, c[3]);
    t = Math.max(t, c[4]);
  });
  return { count, frp, t };
}

export interface Epicentre extends LonLat {
  count: number;
  place: string | null;
}

/**
 * The busiest fire clusters: the cells with the most detections within 60 km, at least 150 km apart,
 * each placed at its cluster's detection-weighted centre.
 */
export function findEpicentres(cells: FireMap["cells"], max = 5, minCount = 15): Epicentre[] {
  const near = binCells(cells);
  const scored = cells.map((c) => {
    let [count, lon, lat] = [0, 0, 0];
    near({ lon: c[0], lat: c[1] }, 60, (n) => {
      count += n[2];
      lon += n[0] * n[2];
      lat += n[1] * n[2];
    });
    return { lon: lon / count, lat: lat / count, count };
  });
  scored.sort((a, b) => b.count - a.count);
  const picked: Epicentre[] = [];
  for (const s of scored) {
    if (picked.length >= max || s.count < minCount) break;
    if (picked.every((p) => kmBetween(p, s) >= 150)) picked.push({ ...s, place: placeNear(s) });
  }
  return picked;
}
