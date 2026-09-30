-- NEA weather stations reporting wind (10-minute averages, published every minute).
CREATE TABLE IF NOT EXISTS wind_stations (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  latitude  double precision NOT NULL,
  longitude double precision NOT NULL
);

CREATE TABLE IF NOT EXISTS wind_readings (
  station_id    text        NOT NULL REFERENCES wind_stations (id),
  observed_at   timestamptz NOT NULL,
  -- Direction the wind blows FROM, in degrees clockwise from north.
  direction_deg smallint    CHECK (direction_deg BETWEEN 0 AND 360),
  speed_knots   real        CHECK (speed_knots >= 0),
  PRIMARY KEY (station_id, observed_at)
);

CREATE INDEX IF NOT EXISTS wind_readings_observed_at_idx ON wind_readings (observed_at DESC);
