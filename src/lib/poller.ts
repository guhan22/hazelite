import { migrate } from "./db";
import { backfill, ingestRecent, isEmpty } from "./ingest";

const globalForPoller = globalThis as unknown as { hazeStarted?: boolean };

async function tick() {
  try {
    const n = await ingestRecent();
    console.log(`[hazelite] ingested ${n} rows`);
  } catch (err) {
    console.error("[hazelite] ingest failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Migrates the DB on every server start. Unless polling is disabled (INGEST_INTERVAL_MINUTES=0,
 * e.g. when an external cron calls POST /api/ingest), it then backfills an empty database and
 * polls NEA on an interval. Runs in the background so it never blocks server start-up.
 */
export function startPoller() {
  if (globalForPoller.hazeStarted) return;
  globalForPoller.hazeStarted = true;
  const minutes = Number(process.env.INGEST_INTERVAL_MINUTES ?? 15);

  void (async () => {
    try {
      const applied = await migrate();
      if (applied.length) console.log(`[hazelite] applied migrations: ${applied.join(", ")}`);
      if (!(minutes > 0)) return;
      const days = Number(process.env.BACKFILL_DAYS_ON_EMPTY ?? 7);
      if (days > 0 && (await isEmpty())) {
        console.log(`[hazelite] empty database, backfilling ${days} days…`);
        await backfill(days);
      }
    } catch (err) {
      console.error("[hazelite] startup failed:", err instanceof Error ? err.message : err);
    }
    if (minutes > 0) {
      setInterval(tick, minutes * 60_000);
      await tick();
    }
  })();
}
