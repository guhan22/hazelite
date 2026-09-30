import { nearestRegion } from "./geo";
import type { Region } from "./schema";

export interface StationWind {
  latitude: number;
  longitude: number;
  directionDeg: number | null;
  speedKnots: number | null;
}

export interface Wind {
  /** Direction the wind blows from, degrees clockwise from north. */
  fromDeg: number;
  compass: string;
  speedKmh: number;
  stations: number;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const KNOTS_TO_KMH = 1.852;
const toRad = (d: number) => (d * Math.PI) / 180;

/**
 * Averages station winds. Direction is a vector mean (so 350° and 10° average to 0°, not 180°);
 * speed is the plain mean, which is what people feel.
 */
function meanWind(stations: StationWind[]): Wind | null {
  const valid = stations.filter((s) => s.directionDeg != null && s.speedKnots != null);
  if (valid.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const s of valid) {
    x += s.speedKnots! * Math.sin(toRad(s.directionDeg!));
    y += s.speedKnots! * Math.cos(toRad(s.directionDeg!));
  }
  const fromDeg = (Math.round((Math.atan2(x, y) * 180) / Math.PI) + 360) % 360;
  const speedKnots = valid.reduce((sum, s) => sum + s.speedKnots!, 0) / valid.length;
  return {
    fromDeg,
    compass: COMPASS[Math.round(fromDeg / 45) % 8],
    speedKmh: Math.round(speedKnots * KNOTS_TO_KMH),
    stations: valid.length,
  };
}

/** Islandwide wind plus per-region wind from the stations nearest each region. */
export function summarizeWind(stations: StationWind[]) {
  const groups = Map.groupBy(stations, (s) => nearestRegion(s.latitude, s.longitude));
  const byRegion: Partial<Record<Region, Wind>> = {};
  for (const [region, group] of groups) {
    const w = meanWind(group);
    if (w) byRegion[region] = w;
  }
  return { islandwide: meanWind(stations), byRegion };
}
