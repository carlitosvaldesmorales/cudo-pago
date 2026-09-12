CREATE TABLE IF NOT EXISTS standings_adjustments (
  adjustment_id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  group_id TEXT,
  table_code TEXT NOT NULL CHECK(table_code IN ('GENERAL','SENIOR')),
  team_id TEXT NOT NULL,
  points_delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  source_label TEXT,
  effective_on TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(team_id) REFERENCES teams(team_id)
);

CREATE INDEX IF NOT EXISTS idx_standings_adjustments_competition
  ON standings_adjustments(competition_id,group_id,table_code,team_id,active);
