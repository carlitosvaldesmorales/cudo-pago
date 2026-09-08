CREATE TABLE IF NOT EXISTS reporters (
  telegram_user_id TEXT PRIMARY KEY,
  display_name TEXT,
  username TEXT,
  club_id TEXT,
  role TEXT NOT NULL DEFAULT 'REPORTER',
  trust_level TEXT NOT NULL DEFAULT 'PROVISIONAL',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  season_id TEXT,
  round_label TEXT,
  kickoff_at TEXT,
  home_id TEXT NOT NULL,
  home_name TEXT NOT NULL,
  away_id TEXT NOT NULL,
  away_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  home_score INTEGER,
  away_score INTEGER,
  validation_status TEXT NOT NULL DEFAULT 'PENDING',
  source_event_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  competition_id TEXT,
  season_id TEXT,
  match_id TEXT,
  actor_id TEXT,
  actor_name TEXT,
  club_id TEXT,
  validation_status TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_match ON events(match_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches(competition_id, status);
