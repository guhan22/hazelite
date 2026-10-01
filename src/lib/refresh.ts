import { sendAlerts } from "./alerts";
import { pool } from "./db";
import { refreshFeeds, runIfDue } from "./feeds";
import { logError } from "./http";
import { ingestRecent } from "./ingest";
import { pruneOldData } from "./retention";

/**
 * Refreshes NEA readings and wind (then sends any haze alerts they trigger), plus any supplementary
 * feed that's due, and once a day prunes old rows. Returns reading rows upserted.
 */
export async function refreshAll(): Promise<number> {
  const [rows] = await Promise.all([
    ingestRecent().then(async (n) => (await sendAlerts(), n)),
    refreshFeeds(),
    runIfDue("cleanup", 24 * 60, pruneOldData).catch((err) => logError("cleanup", err)),
  ]);
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
