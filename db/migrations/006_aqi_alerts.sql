-- Alerts now follow 1-hr AQI. Its levels keep the old names (similar thresholds) and add
-- "unhealthy-sensitive" (AQI 101+). last_severity holds the AQI level last notified.
ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_level_check;
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_level_check
  CHECK (level IN ('unhealthy-sensitive', 'unhealthy', 'very-unhealthy', 'hazardous'));
