-- One row per NEA region per hourly observation.
CREATE TABLE IF NOT EXISTS readings (
  region        text        NOT NULL CHECK (region IN ('north', 'south', 'east', 'west', 'central')),
  observed_at   timestamptz NOT NULL,
  psi_24h       smallint,
  pm25_1h       smallint,
  pm25_24h      smallint,
  pm10_24h      smallint,
  so2_24h       smallint,
  no2_1h_max    smallint,
  o3_8h_max     smallint,
  co_8h_max     real,
  pm25_sub      smallint,
  pm10_sub      smallint,
  so2_sub       smallint,
  o3_sub        smallint,
  co_sub        smallint,
  source_updated_at timestamptz,
  ingested_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (region, observed_at)
);

CREATE INDEX IF NOT EXISTS readings_observed_at_idx ON readings (observed_at DESC);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id          bigserial   PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  dates       text[]      NOT NULL,
  rows_upserted integer,
  error       text
);
