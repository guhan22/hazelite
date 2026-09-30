import { pool } from "./db";
import { MEASURE_KEYS, MEASURES, type Measures, type Region } from "./schema";
import { summarizeWind, type StationWind } from "./wind";

export const RANGES = {
  "24h": { label: "24 hours", hours: 24, bucket: "hour" },
  "3d": { label: "3 days", hours: 72, bucket: "hour" },
  "7d": { label: "7 days", hours: 168, bucket: "hour" },
  "30d": { label: "30 days", hours: 720, bucket: "hour" },
  "3m": { label: "3 months", hours: 2160, bucket: "day" },
} as const;
export type RangeKey = keyof typeof RANGES;
export type Bucket = "hour" | "day";

/** Allow-lists the `range` query parameter. */
export function parseRange(value: unknown): RangeKey {
  return typeof value === "string" && Object.hasOwn(RANGES, value) ? (value as RangeKey) : "3d";
}

export type LatestReading = { region: Region; observedAt: Date } & Measures;

// Aliases come from the static MEASURES table, never from input.
const MEASURE_SELECT = MEASURE_KEYS.map((k) => `${MEASURES[k].column} AS "${k}"`).join(", ");

/** Readings for the most recent hour that has a PSI value. */
export async function getLatest(): Promise<LatestReading[]> {
  const { rows } = await pool.query<LatestReading>(`
    SELECT region, observed_at AS "observedAt", ${MEASURE_SELECT} FROM readings
    WHERE observed_at = (SELECT max(observed_at) FROM readings WHERE psi_24h IS NOT NULL)
    ORDER BY region`);
  return rows;
}

/** Max 24-hr PSI across regions `hoursAgo` hours before `at`. */
export async function getNationalPsiAt(at: Date, hoursAgo: number): Promise<number | null> {
  const { rows } = await pool.query<{ psi: number | null }>(
    `SELECT max(psi_24h)::int AS psi FROM readings
     WHERE observed_at = $1::timestamptz - make_interval(hours => $2)`,
    [at, hoursAgo],
  );
  return rows[0]?.psi ?? null;
}

export interface SeriesPoint {
  t: number;
  values: Partial<Record<Region, { psi: number | null; pm25: number | null }>>;
}

// Chosen by key from this static map, never from input.
const BUCKET_SQL: Record<Bucket, string> = {
  hour: "observed_at",
  day: "date_trunc('day', observed_at AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'Asia/Singapore'",
};

/** Readings for every region over the last `hours`, oldest first: hourly, or each SGT day's maximum. */
export async function getSeries(hours: number, bucket: Bucket = "hour"): Promise<SeriesPoint[]> {
  const { rows } = await pool.query<{ region: Region; t: Date; psi: number | null; pm25: number | null }>(
    `SELECT region, ${BUCKET_SQL[bucket]} AS t, max(psi_24h) AS psi, max(pm25_1h) AS pm25 FROM readings
     WHERE observed_at > (SELECT max(observed_at) FROM readings) - make_interval(hours => $1)
     GROUP BY region, t ORDER BY t`,
    [hours],
  );
  const byTime = new Map<number, SeriesPoint>();
  for (const r of rows) {
    const t = r.t.getTime();
    let p = byTime.get(t);
    if (!p) byTime.set(t, (p = { t, values: {} }));
    p.values[r.region] = { psi: r.psi, pm25: r.pm25 };
  }
  return [...byTime.values()];
}

/** Whether the most recent finished ingest failed. The error text stays server-side. */
export async function lastIngestFailed(): Promise<boolean> {
  const { rows } = await pool.query<{ failed: boolean }>(
    "SELECT error IS NOT NULL AS failed FROM ingest_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1",
  );
  return rows[0]?.failed ?? false;
}

/** Latest wind from every station reporting in the last two hours, islandwide and per region. */
export async function getLatestWind() {
  const { rows } = await pool.query<StationWind>(
    `SELECT DISTINCT ON (r.station_id) s.latitude, s.longitude,
            r.direction_deg AS "directionDeg", r.speed_knots AS "speedKnots"
     FROM wind_readings r JOIN wind_stations s ON s.id = r.station_id
     WHERE r.observed_at > now() - interval '2 hours'
     ORDER BY r.station_id, r.observed_at DESC`,
  );
  return summarizeWind(rows);
}

export interface HistoryContext {
  /** Share of hours in the past year with a lower islandwide 24-hr PSI, 0–100. */
  percentile: number | null;
  /** Most recent hour, before the past week, when islandwide PSI was at least this high. */
  lastThisHigh: Date | null;
  /** Earliest stored reading: how far back history goes. */
  recordsSince: Date | null;
  /** Islandwide 24-hr PSI at the same hour a year earlier. */
  yearAgo: number | null;
  /** Share of hours actually stored in the comparison window, 0–100. Gaps (e.g. mid-backfill) lower it. */
  coverage: number | null;
}

/** How the islandwide 24-hr PSI `psi` at `at` compares with stored history. */
export async function getHistoryContext(at: Date, psi: number): Promise<HistoryContext> {
  const { rows } = await pool.query<HistoryContext>(
    `WITH national AS (
       SELECT observed_at, max(psi_24h) AS psi FROM readings
       WHERE psi_24h IS NOT NULL AND observed_at <= $1
       GROUP BY observed_at
     )
     SELECT
       (SELECT round(100.0 * count(*) FILTER (WHERE psi < $2) / nullif(count(*), 0))::int
          FROM national WHERE observed_at > $1::timestamptz - interval '1 year') AS percentile,
       (SELECT max(observed_at) FROM national
          WHERE psi >= $2 AND observed_at < $1::timestamptz - interval '7 days') AS "lastThisHigh",
       (SELECT min(observed_at) FROM national) AS "recordsSince",
       (SELECT psi FROM national WHERE observed_at = $1::timestamptz - interval '1 year') AS "yearAgo",
       (SELECT round(100.0 * count(*) / (extract(epoch FROM $1::timestamptz - min(observed_at)) / 3600 + 1))::int
          FROM national WHERE observed_at > $1::timestamptz - interval '1 year') AS coverage`,
    [at, psi],
  );
  return rows[0];
}
