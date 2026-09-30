-- Opt-in: also notify this browser when a new version of Hazelite goes live.
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS updates boolean NOT NULL DEFAULT false;

-- Versions already announced, so a repeated deployment event never notifies twice.
CREATE TABLE IF NOT EXISTS releases (
  version      text        PRIMARY KEY,
  announced_at timestamptz NOT NULL DEFAULT now()
);
