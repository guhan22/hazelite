import { pool } from "./db";

// The app only reads wind from the last two hours and the latest ingest run, so older rows are just
// weight in the free-tier database. Readings are kept forever: they're the charts' history.
const WIND_DAYS = 7;
const INGEST_RUN_DAYS = 30;

/** Deletes wind readings and ingest-run logs past their retention. Returns how many rows went. */
export async function pruneOldData(): Promise<{ wind: number; ingestRuns: number }> {
  const [wind, runs] = await Promise.all([
    pool.query("DELETE FROM wind_readings WHERE observed_at < now() - make_interval(days => $1)", [WIND_DAYS]),
    pool.query("DELETE FROM ingest_runs WHERE started_at < now() - make_interval(days => $1)", [INGEST_RUN_DAYS]),
  ]);
  return { wind: wind.rowCount ?? 0, ingestRuns: runs.rowCount ?? 0 };
}
