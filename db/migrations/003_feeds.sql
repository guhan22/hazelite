-- Supplementary sources (forecasts, fire hotspots, news): the latest snapshot of each, refreshed on its own schedule.
CREATE TABLE IF NOT EXISTS feeds (
  name         text        PRIMARY KEY,
  data         jsonb,
  fetched_at   timestamptz,
  -- Claimed before each fetch, so concurrent refreshes (several serverless instances) don't all call upstream.
  attempted_at timestamptz NOT NULL DEFAULT now(),
  error        text
);
