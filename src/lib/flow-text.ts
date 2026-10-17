// Plain-English descriptions of the haze map's air paths, places and winds.

import { FIRE_AREAS, inside } from "./fires";
import { compassWord, kmBetween, placeNear, SINGAPORE, valueAt, type Field, type LonLat, type PathPoint } from "./flow";
import { HOUR } from "./time";

export const hoursLabel = (h: number) => `${h} ${h === 1 ? "hr" : "hrs"}`;
export const latLon = ({ lon, lat }: LonLat) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? "S" : "N"}, ${lon.toFixed(1)}°E`;

/** The closest an air path comes to Singapore, and how many hours along it. */
function approach(path: PathPoint[]) {
  let best = { km: Infinity, hours: 0 };
  for (const p of path) {
    const km = kmBetween(p, SINGAPORE);
    if (km < best.km) best = { km, hours: Math.round(Math.abs(p.t - path[0].t) / HOUR) };
  }
  return best;
}

/** "reaches Singapore in about 20 hrs", "comes within 340 km of Singapore, in about 30 hrs", and so on. */
export function approachText(path: PathPoint[]) {
  if (path.length < 2) return null;
  const { km, hours } = approach(path);
  if (km < 80) return hours === 0 ? "is over Singapore now" : `reaches Singapore in about ${hoursLabel(hours)}`;
  const total = Math.round((path.at(-1)!.t - path[0].t) / HOUR);
  if (hours === 0) return `heads away from Singapore over the next ${hoursLabel(total)}`;
  // Closest at the very end: the forecast runs out while it's still on its way.
  if (hours === total) return `is still drifting toward Singapore after ${hoursLabel(hours)}, about ${Math.round(km / 10) * 10} km away`;
  return `comes within ${Math.round(km / 10) * 10} km of Singapore, in about ${hoursLabel(hours)}`;
}

/** Island or province names along a path, in order, without repeats. */
export function placesAlong(path: LonLat[]) {
  const names: string[] = [];
  for (const p of path) {
    const island = FIRE_AREAS.find((a) => inside([p.lon, p.lat], a.outline))?.name;
    const place = province(placeNear(p));
    for (const n of [island, place]) if (n && n !== "Singapore" && !names.includes(n)) names.push(n);
  }
  return names;
}

/** "Ketapang, West Kalimantan" → "West Kalimantan". */
export const province = (place: string | null) => place?.split(", ").at(-1) ?? null;

export const listJoin = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** "From the southwest, 18 km/h" at a spot, or "Calm". */
export function windText(field: Field, p: LonLat) {
  const [u, v] = [valueAt(field.u, p.lon, p.lat) ?? 0, valueAt(field.v, p.lon, p.lat) ?? 0];
  const speed = Math.round(Math.hypot(u, v));
  if (speed < 2) return "Calm";
  // The wind blows from the opposite of where it's heading.
  const from = (Math.atan2(-u, -v) * 180) / Math.PI + 360;
  return `From the ${compassWord(from % 360)}, ${speed} km/h`;
}
