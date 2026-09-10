-- G3 / RESULT-GOVERNANCE-01
-- Official results are never silently overwritten after this migration.
-- match_series_results remains the current projection; this table keeps immutable versions.

ALTER TABLE match_series_results ADD COLUMN governance_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS match_series_result_versions (
  version_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  version_no INTEGER NOT NULL CHECK(version_no >= 1),
  home_score INTEGER NOT NULL CHECK(home_score >= 0),
  away_score INTEGER NOT NULL CHECK(away_score >= 0),
  validation_status TEXT NOT NULL CHECK(validation_status IN ('VERIFIED','DISPUTED','ANNULLED')),
  action TEXT NOT NULL CHECK(action IN ('BASELINE','CORRECT','DISPUTE','RESOLVE','ANNUL','RESTORE')),
  reason TEXT,
  source_type TEXT,
  source_label TEXT,
  source_ref TEXT,
  played_on TEXT,
  actor_id TEXT,
  actor_role TEXT,
  actor_club_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(match_id,series_code,version_no),
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);

CREATE INDEX IF NOT EXISTS idx_result_versions_series
  ON match_series_result_versions(match_id,series_code,version_no DESC);

CREATE TABLE IF NOT EXISTS telegram_result_governance_sessions (
  telegram_user_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  action TEXT NOT NULL CHECK(action IN ('CORRECT')),
  state TEXT NOT NULL CHECK(state IN ('AWAIT_SCORE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);

-- Snapshot every already-materialized result as version 1.
INSERT OR IGNORE INTO match_series_result_versions (
  version_id,match_id,series_code,version_no,home_score,away_score,validation_status,
  action,reason,source_type,source_label,source_ref,played_on,created_at
)
SELECT
  match_id || ':' || series_code || ':v1',match_id,series_code,1,home_score,away_score,
  CASE WHEN validation_status='VERIFIED' THEN 'VERIFIED' ELSE 'DISPUTED' END,
  'BASELINE','migration_baseline',source_type,source_label,source_ref,played_on,created_at
FROM match_series_results;

-- Future first-time official results automatically get their immutable baseline.
CREATE TRIGGER IF NOT EXISTS trg_match_series_result_baseline
AFTER INSERT ON match_series_results
BEGIN
  INSERT OR IGNORE INTO match_series_result_versions (
    version_id,match_id,series_code,version_no,home_score,away_score,validation_status,
    action,reason,source_type,source_label,source_ref,played_on,created_at
  ) VALUES (
    NEW.match_id || ':' || NEW.series_code || ':v' || NEW.governance_version,
    NEW.match_id,NEW.series_code,NEW.governance_version,NEW.home_score,NEW.away_score,
    CASE WHEN NEW.validation_status='VERIFIED' THEN 'VERIFIED' ELSE 'DISPUTED' END,
    'BASELINE','initial_official_result',NEW.source_type,NEW.source_label,NEW.source_ref,NEW.played_on,NEW.created_at
  );
END;
