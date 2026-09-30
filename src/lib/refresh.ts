import { sendAlerts } from "./alerts";
import { pool } from "./db";
import { refreshFeeds } from "./feeds";
import { logError } from "./http";
import { ingestRecent } from "./ingest";

/**
 * Refreshes NEA readings and wind (then sends any haze alerts they trigger), plus any supplementary
 * feed that's due. Returns reading rows upserted.
 */
export async function refreshAll(): Promise<number> {
  const [rows] = await Promise.all([ingestRecent().then(async (n) => (await sendAlerts(), n)), refreshFeeds()]);
  return rows;
}

/**
 * Refreshes when no ingest has started in the last 30 minutes. On serverless hosts there is no
 * background poller, so page visits (via `after()`) and scheduled calls to /api/ingest keep the data
 * fresh. NEA publishes hourly, so this lags a new reading by at most ~30 minutes while people are visiting.
 */
export async function refreshIfStale(): Promise<void> {
  try {
    const { rows } = await pool.query<{ stale: boolean }>(
      "SELECT coalesce(max(started_at) < now() - interval '30 minutes', true) AS stale FROM ingest_runs",
    );
    if (rows[0]?.stale) await refreshAll();
  } catch (err) {
    logError("refresh", err);
  }
}
