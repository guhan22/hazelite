export const REGIONS = ["north", "south", "east", "west", "central"] as const;
export type Region = (typeof REGIONS)[number];

/**
 * Every per-region measure NEA publishes, keyed by our field name: its `readings` column and
 * its key in the data.gov.sg response (from the PSI endpoint unless `endpoint` says otherwise).
 * Adding a measure is one line here plus a migration.
 */
export const MEASURES = {
  psi24h: { column: "psi_24h", api: "psi_twenty_four_hourly" },
  pm25_1h: { column: "pm25_1h", api: "pm25_one_hourly", endpoint: "pm25" },
  pm25_24h: { column: "pm25_24h", api: "pm25_twenty_four_hourly" },
  pm10_24h: { column: "pm10_24h", api: "pm10_twenty_four_hourly" },
  so2_24h: { column: "so2_24h", api: "so2_twenty_four_hourly" },
  no2_1hMax: { column: "no2_1h_max", api: "no2_one_hour_max" },
  o3_8hMax: { column: "o3_8h_max", api: "o3_eight_hour_max" },
  co_8hMax: { column: "co_8h_max", api: "co_eight_hour_max" },
  pm25Sub: { column: "pm25_sub", api: "pm25_sub_index" },
  pm10Sub: { column: "pm10_sub", api: "pm10_sub_index" },
  so2Sub: { column: "so2_sub", api: "so2_sub_index" },
  o3Sub: { column: "o3_sub", api: "o3_sub_index" },
  coSub: { column: "co_sub", api: "co_sub_index" },
} as const satisfies Record<string, Measure>;

interface Measure {
  column: string;
  api: string;
  endpoint?: "pm25";
}

export type MeasureKey = keyof typeof MEASURES;
export type Measures = Record<MeasureKey, number | null>;
export const MEASURE_KEYS = Object.keys(MEASURES) as MeasureKey[];

export function endpointOf(k: MeasureKey): "psi" | "pm25" {
  const m: Measure = MEASURES[k];
  return m.endpoint ?? "psi";
}

export const emptyMeasures = (): Measures =>
  Object.fromEntries(MEASURE_KEYS.map((k) => [k, null])) as Measures;
