import { pool } from "./db";
import { fetchHotspots } from "./fires";
import { fetchPm25Forecast } from "./forecast";
import { errorMessage, logError } from "./http";
import { fetchNeaForecast } from "./nea";
import { fetchNews } from "./news";

interface Feed<T> {
  /** Minimum minutes between fetches. */
  every: number;
  /** Sources that need a key stay off until it's configured. */
  enabled?: () => boolean;
  /** Fetches a new snapshot; `previous` lets a feed build on what's stored (e.g. keep history). */
  fetch: (previous: T | null) => Promise<T>;
}

const feed = <T>(f: Feed<T>) => f;

/** Every supplementary source. Adding one is an entry here; no schema change needed. */
const FEEDS = {
  neaForecast: feed({ every: 30, fetch: fetchNeaForecast }),
  pm25Forecast: feed({ every: 180, fetch: fetchPm25Forecast }),
  hotspots: feed({ every: 180, enabled: () => !!process.env.FIRMS_MAP_KEY, fetch: fetchHotspots }),
  news: feed({ every: 60, fetch: fetchNews }),
};

type FeedName = keyof typeof FEEDS;
export type Feeds = { [K in FeedName]: Awaited<ReturnType<(typeof FEEDS)[K]["fetch"]>> | null };
const NAMES = Object.keys(FEEDS) as FeedName[];

/**
 * Runs a scheduled task if it hasn't run within `every` minutes, storing its result under `name`.
 * The claim succeeds for one caller only, so the task runs once however many refreshes race.
 */
export async function runIfDue<T>(name: string, every: number, task: (previous: T | null) => Promise<T>) {
  const { rows } = await pool.query<{ data: T | null }>(
    `INSERT INTO feeds (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET attempted_at = now()
     WHERE feeds.attempted_at < now() - make_interval(mins => $2)
     RETURNING data`,
    [name, every],
  );
  if (rows.length === 0) return;
  try {
    const data = await task(rows[0].data);
    await pool.query("UPDATE feeds SET data = $2::jsonb, fetched_at = now(), error = NULL WHERE name = $1", [name, JSON.stringify(data)]);
  } catch (err) {
    // Keep the last good snapshot; the error stays server-side.
    await pool.query("UPDATE feeds SET error = $2 WHERE name = $1", [name, errorMessage(err)]);
    throw err;
  }
}

/** Refreshes every feed that's due. One failing source never blocks the others, and this never throws. */
export async function refreshFeeds(): Promise<void> {
  const results = await Promise.allSettled(
    NAMES.map((name) => {
      const { every, enabled, fetch } = FEEDS[name] as Feed<unknown>;
      return enabled && !enabled() ? null : runIfDue(name, every, fetch);
    }),
  );
  results.forEach((r, i) => r.status === "rejected" && logError(`${NAMES[i]} feed`, r.reason));
}

/** The latest stored snapshot of each feed (null if never fetched). */
export async function getFeeds(): Promise<Feeds> {
  const feeds = Object.fromEntries(NAMES.map((n) => [n, null])) as Feeds;
  const { rows } = await pool.query<{ name: string; data: unknown }>("SELECT name, data FROM feeds WHERE data IS NOT NULL");
  for (const r of rows) if (Object.hasOwn(FEEDS, r.name)) (feeds as Record<string, unknown>)[r.name] = r.data;
  return feeds;
}
