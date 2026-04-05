-- Migration: 004_field_log
-- Creates the field_log table for tracking in-app user events and GM actions.

CREATE TABLE IF NOT EXISTS field_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id     TEXT        NOT NULL,
  event_type    TEXT        NOT NULL,          -- e.g. 'trade_proposed', 'waiver_claimed', 'gm_note'
  player_id     TEXT,                          -- Sleeper player id (nullable)
  roster_id     INTEGER,                       -- Sleeper roster id (nullable)
  season        TEXT,                          -- e.g. '2026'
  week          INTEGER,                       -- NFL week number (nullable)
  payload       JSONB       DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast per-user, per-league queries
CREATE INDEX IF NOT EXISTS idx_field_log_user_league
  ON field_log (user_id, league_id, created_at DESC);

-- Index for event-type filtering
CREATE INDEX IF NOT EXISTS idx_field_log_event_type
  ON field_log (event_type, created_at DESC);

-- RLS: users can only read/write their own rows
ALTER TABLE field_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY field_log_select ON field_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY field_log_insert ON field_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY field_log_delete ON field_log
  FOR DELETE USING (auth.uid() = user_id);
