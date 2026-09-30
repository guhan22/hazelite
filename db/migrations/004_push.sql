-- Browsers subscribed to haze alerts. Holds no personal data: a push-service address and three choices.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint      text        PRIMARY KEY CHECK (length(endpoint) <= 1000),
  p256dh        text        NOT NULL,
  auth          text        NOT NULL,
  region        text        NOT NULL CHECK (region IN ('north', 'south', 'east', 'west', 'central')),
  -- Alert once 1-hr PM2.5 in `region` reaches this severity.
  level         text        NOT NULL CHECK (level IN ('unhealthy', 'very-unhealthy', 'hazardous')),
  profile       text        NOT NULL CHECK (profile IN ('general', 'vulnerable')),
  -- Severity this subscriber was last told about, so each change is notified once.
  last_severity text        NOT NULL DEFAULT 'good',
  notified_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
