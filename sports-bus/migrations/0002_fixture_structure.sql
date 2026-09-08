ALTER TABLE matches ADD COLUMN group_id TEXT;
ALTER TABLE matches ADD COLUMN round_no INTEGER;
ALTER TABLE matches ADD COLUMN source_label TEXT;
ALTER TABLE matches ADD COLUMN source_ref TEXT;

CREATE TABLE IF NOT EXISTS competitions (
  competition_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season_id TEXT,
  phase TEXT,
  source_label TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  team_id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  group_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_aliases (
  alias TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  source_label TEXT,
  FOREIGN KEY(team_id) REFERENCES teams(team_id)
);

CREATE TABLE IF NOT EXISTS byes (
  bye_id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  season_id TEXT,
  group_id TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  source_label TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matches_group_round ON matches(competition_id, group_id, round_no);
CREATE INDEX IF NOT EXISTS idx_byes_group_round ON byes(competition_id, group_id, round_no);
