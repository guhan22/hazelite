-- Alerts offer three 1-hr AQI levels again (Unhealthy 151+, Very unhealthy 201+, Hazardous 301+):
-- anyone who picked "unhealthy-sensitive" (AQI 101+) moves to the nearest remaining level.
UPDATE push_subscriptions SET level = 'unhealthy' WHERE level = 'unhealthy-sensitive';
ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_level_check;
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_level_check
  CHECK (level IN ('unhealthy', 'very-unhealthy', 'hazardous'));
