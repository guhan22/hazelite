import { getFeeds, type Feeds } from "./feeds";
import { logError } from "./http";
import { aboutSingaporeHaze } from "./news";
import {
  getLatest,
  getLatestWind,
  getNationalPsiAt,
  getSeries,
  lastIngestFailed,
  RANGES,
  type RangeKey,
} from "./queries";

const REPLAY_HOURS = 72;
const NO_FEEDS: Feeds = { neaForecast: null, pm25Forecast: null, hotspots: null, news: null };
const NO_WIND = { islandwide: null, byRegion: {} };

/**
 * Everything the dashboard shows, in two rounds of queries. Throws if the database is
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
    getFeeds().catch((err) => (logError("feeds query", err), NO_FEEDS)),
  ]);

  const observedAt = latest[0]?.observedAt;
  const psiDayAgo = observedAt ? await getNationalPsiAt(observedAt, 24) : null;

  // Headlines stored before the Singapore-only rule are filtered on the way out too.
  const news = feeds.news?.filter(aboutSingaporeHaze) ?? null;
  return { latest, series, refreshFailed, wind, replay: replay ?? series, feeds: { ...feeds, news }, psiDayAgo };
}
