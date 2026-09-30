import { pool } from "./db";
import { ingestRecent } from "./ingest";

/**
 * Refreshes from NEA when no ingest has started in the last 30 minutes. On serverless hosts there is
 * no background poller, so page visits (via `after()`) and a daily cron keep the data fresh.
 * NEA publishes hourly, so this lags a new reading by at most ~30 minutes while people are visiting.
 */
export async function refreshIfStale(): Promise<void> {
  try {
    const { rows } = await pool.query<{ stale: boolean }>(
      "SELECT coalesce(max(started_at) < now() - interval '30 minutes', true) AS stale FROM ingest_runs",
    );
    if (rows[0]?.stale) await ingestRecent();
  } catch (err) {
    console.error("[hazelite] refresh failed:", err instanceof Error ? err.message : err);
  }
}
