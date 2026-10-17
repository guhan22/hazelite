import { getFeeds, type Feeds } from "./feeds";
import { logError } from "./http";
import { range } from "./summary";
import { HOUR } from "./time";
import {
  getLatest,
  getLatestWind,
  getSeries,
  lastIngestFailed,
  RANGES,
  type RangeKey,
} from "./queries";

const REPLAY_HOURS = 72;
// The haze map loads its own (larger) feeds from /api/haze-map, only when its tab is opened.
const FEED_NAMES = ["neaForecast", "pm25Forecast", "hotspots"] as const;
const NO_FEEDS: Pick<Feeds, (typeof FEED_NAMES)[number]> = { neaForecast: null, pm25Forecast: null, hotspots: null };
const NO_WIND = { islandwide: null, byRegion: {} };

/**
 * Everything the dashboard shows, in one round of parallel queries. Throws if the database is
 * unreachable; wind and the supplementary feeds degrade to empty instead, since the page works without them.
 */
export async function getDashboard(rangeKey: RangeKey) {
  const { hours, bucket } = RANGES[rangeKey];
  // The replay always covers the last 72 hours, hourly; reuse the chart series when it's the same.
  const sameAsReplay = hours === REPLAY_HOURS && bucket === "hour";
  const [latest, series, refreshFailed, wind, replay, feeds] = await Promise.all([
    getLatest(),
    getSeries(hours, bucket),
    lastIngestFailed(),
    getLatestWind().catch((err) => (logError("wind query", err), NO_WIND)),
    sameAsReplay ? null : getSeries(REPLAY_HOURS, "hour"),
    getFeeds(FEED_NAMES).catch((err) => (logError("feeds query", err), NO_FEEDS)),
  ]);

  // The 72-hour replay already holds every region's 24-hr PSI by the hour: read "a day ago" from it
  // rather than spending another database round trip.
  const recent = replay ?? series;
  const observedAt = latest[0]?.observedAt;
  const dayAgo = observedAt && recent.find((p) => p.t === observedAt.getTime() - 24 * HOUR);
  const psiDayAgo = dayAgo ? (range(Object.values(dayAgo.values).map((v) => v?.psi ?? null))?.max ?? null) : null;
  return { latest, series, refreshFailed, wind, replay: recent, feeds, psiDayAgo };
}
