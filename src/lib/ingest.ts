import { pool } from "./db";
import { errorMessage, logError } from "./http";
import { fetchReadings, fetchWind, type ReadingRow } from "./nea";
import { MEASURE_KEYS, MEASURES } from "./schema";
import { sgtDate } from "./time";

// Column names come from the static MEASURES table, never from input, so interpolating them is safe.
const COLUMNS = ["region", "observed_at", ...MEASURE_KEYS.map((k) => MEASURES[k].column), "source_updated_at"];
const toParams = (r: ReadingRow) => [r.region, r.observedAt, ...MEASURE_KEYS.map((k) => r[k]), r.sourceUpdatedAt];

async function upsert(rows: ReadingRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const tuples = rows.map((_, i) => `(${COLUMNS.map((_, j) => `$${i * COLUMNS.length + j + 1}`).join(", ")})`);
  // COALESCE keeps an existing value when a partial re-fetch returns null for it.
  const updates = COLUMNS.slice(2)
    .map((c) => `${c} = COALESCE(EXCLUDED.${c}, readings.${c})`)
    .join(", ");
  const res = await pool.query(
    `INSERT INTO readings (${COLUMNS.join(", ")}) VALUES ${tuples.join(", ")}
     ON CONFLICT (region, observed_at) DO UPDATE SET ${updates}, ingested_at = now()`,
    rows.flatMap(toParams),
  );
  return res.rowCount ?? 0;
}

/** Fetches and stores the given SGT dates. Records the run in ingest_runs. */
async function ingestDates(dates: string[]): Promise<number> {
  const { rows } = await pool.query<{ id: string }>("INSERT INTO ingest_runs (dates) VALUES ($1) RETURNING id", [dates]);
  let total = 0;
  let error: string | null = null;
  try {
    for (const date of dates) total += await upsert(await fetchReadings(date));
    return total;
  } catch (err) {
    error = errorMessage(err);
    throw err;
  } finally {
    await pool.query("UPDATE ingest_runs SET finished_at = now(), rows_upserted = $2, error = $3 WHERE id = $1", [
      rows[0].id,
      total,
      error,
    ]);
  }
}

/** Stores the latest reading from every wind station. */
async function ingestWind(): Promise<number> {
  const rows = await fetchWind();
  if (rows.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO wind_stations (id, name, latitude, longitude)
       SELECT * FROM unnest($1::text[], $2::text[], $3::float8[], $4::float8[])
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude`,
      [rows.map((r) => r.stationId), rows.map((r) => r.name), rows.map((r) => r.latitude), rows.map((r) => r.longitude)],
    );
    const res = await client.query(
      `INSERT INTO wind_readings (station_id, observed_at, direction_deg, speed_knots)
       SELECT * FROM unnest($1::text[], $2::timestamptz[], $3::smallint[], $4::real[])
       ON CONFLICT (station_id, observed_at) DO NOTHING`,
      [rows.map((r) => r.stationId), rows.map((r) => r.observedAt), rows.map((r) => r.directionDeg), rows.map((r) => r.speedKnots)],
    );
    await client.query("COMMIT");
    return res.rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

let inFlight: Promise<number> | null = null;

/**
 * Refreshes today's readings (and yesterday's, to catch late revisions around midnight) plus the
 * latest wind. Concurrent callers (poller, API) share one run, so the upstream API is never hit in
 * parallel. A wind failure is logged but never fails the air-quality refresh.
 */
export function ingestRecent(): Promise<number> {
  inFlight ??= Promise.all([
    ingestDates([sgtDate(1), sgtDate(0)]),
    ingestWind().catch((err) => logError("wind ingest", err)),
  ])
    .then(([rows]) => rows)
    .finally(() => (inFlight = null));
  return inFlight;
}

/** Backfills the last `days` SGT days, oldest first. */
export function backfill(days: number): Promise<number> {
  return ingestDates(Array.from({ length: days }, (_, i) => sgtDate(days - 1 - i)));
}

export async function isEmpty(): Promise<boolean> {
  const { rows } = await pool.query("SELECT 1 FROM readings LIMIT 1");
  return rows.length === 0;
}
