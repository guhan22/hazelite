import { REGIONS, type Region } from "./schema";

/** NEA's label location for each reporting region (from the API's regionMetadata). */
const REGION_LOCATIONS: Record<Region, { latitude: number; longitude: number }> = {
  north: { latitude: 1.41803, longitude: 103.82 },
  south: { latitude: 1.29587, longitude: 103.82 },
  east: { latitude: 1.35735, longitude: 103.94 },
  west: { latitude: 1.35735, longitude: 103.7 },
  central: { latitude: 1.35735, longitude: 103.82 },
};

/** The region whose label location is closest. Flat-earth distance is accurate enough across Singapore. */
export function nearestRegion(latitude: number, longitude: number): Region {
  const dist = (r: Region) => (REGION_LOCATIONS[r].latitude - latitude) ** 2 + (REGION_LOCATIONS[r].longitude - longitude) ** 2;
  return REGIONS.reduce((a, b) => (dist(b) < dist(a) ? b : a));
}
