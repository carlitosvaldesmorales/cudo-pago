ALTER TABLE standings_adjustments RENAME TO standings_adjustments_v1;
DROP INDEX IF EXISTS idx_standings_adjustments_competition;

CREATE TABLE standings_adjustments (
  adjustment_id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  group_id TEXT,
  championship_code TEXT NOT NULL CHECK(championship_code IN ('PRINCIPAL','SENIOR')),
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

INSERT INTO standings_adjustments (
  adjustment_id,competition_id,group_id,championship_code,team_id,points_delta,
  reason,source_label,effective_on,active,created_at,updated_at
)
SELECT
  adjustment_id,competition_id,group_id,
  CASE table_code WHEN 'GENERAL' THEN 'PRINCIPAL' ELSE 'SENIOR' END,
  team_id,points_delta,reason,source_label,effective_on,active,created_at,updated_at
FROM standings_adjustments_v1;

DROP TABLE standings_adjustments_v1;

CREATE INDEX idx_standings_adjustments_competition
  ON standings_adjustments(competition_id,group_id,championship_code,team_id,active);
