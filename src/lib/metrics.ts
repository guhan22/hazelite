import { aqiFromPm25, AQI_BANDS, PM25_BANDS, PSI_BANDS, type Band } from "./bands";
import type { Region } from "./schema";

/** What a region tile needs: the two headline measures. */
export interface TileReading {
  region: Region;
  psi24h: number | null;
  pm25_1h: number | null;
}

export type MetricId = "aqi" | "pm25" | "psi";

export interface Metric {
  id: MetricId;
  /** Name for toggles, tile captions and share text. */
  name: string;
  unit: string;
  bands: Band[];
  value: (r: TileReading) => number | null;
}

/**
 * The three ways to read the map. 1-hr PM2.5 is NEA's official "right now" measure (for the next few
 * hours); 24-hr PSI is the official daily index (for planning ahead). NEA publishes no 1-hr PSI.
 * 1-hr AQI is the widely known US EPA index, derived here from 1-hr PM2.5.
 */
export const METRICS: Record<MetricId, Metric> = {
  aqi: { id: "aqi", name: "1-hr AQI", unit: "", bands: AQI_BANDS, value: (r) => aqiFromPm25(r.pm25_1h) },
  pm25: { id: "pm25", name: "1-hr PM2.5", unit: "µg/m³", bands: PM25_BANDS, value: (r) => r.pm25_1h },
  psi: { id: "psi", name: "24-hr PSI", unit: "", bands: PSI_BANDS, value: (r) => r.psi24h },
};
