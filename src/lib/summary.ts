import type { LatestReading } from "./queries";

/** Min/max of the non-null values, or null if there are none. */
export function range(values: (number | null)[]) {
  const v = values.filter((x): x is number => x != null);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}

export const formatRange = (r: ReturnType<typeof range>) => (!r ? "–" : r.min === r.max ? `${r.max}` : `${r.min}–${r.max}`);

/** The region with the highest 24-hr PSI. */
export const worstRegion = <T extends Pick<LatestReading, "psi24h">>(readings: T[]): T | undefined =>
  readings.reduce<T | undefined>((a, b) => (!a || (b.psi24h ?? -1) > (a.psi24h ?? -1) ? b : a), undefined);

const SUB_INDICES = [
  ["PM2.5", "pm25Sub"],
  ["PM10", "pm10Sub"],
  ["O₃", "o3Sub"],
  ["SO₂", "so2Sub"],
  ["CO", "coSub"],
] as const;

/** The pollutant whose sub-index sets the PSI. */
export function drivingPollutant(r: LatestReading) {
  const [name, key] = SUB_INDICES.reduce((a, b) => ((r[b[1]] ?? -1) > (r[a[1]] ?? -1) ? b : a));
  return r[key] == null ? "–" : `${name} (sub-index ${r[key]})`;
}
