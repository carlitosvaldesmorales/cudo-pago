-- CONTRIBUTOR-OBSERVATION-PLANE-01
-- Separates observations from canonical state and keeps role, trust and scope explicit.

ALTER TABLE public_result_submissions ADD COLUMN source_type TEXT NOT NULL DEFAULT 'PUBLIC_USER';
ALTER TABLE public_result_submissions ADD COLUMN source_label TEXT;
ALTER TABLE public_result_submissions ADD COLUMN trust_level TEXT NOT NULL DEFAULT 'PROVISIONAL';
ALTER TABLE public_result_submissions ADD COLUMN evidence_ref TEXT;
ALTER TABLE public_result_submissions ADD COLUMN observation_kind TEXT NOT NULL DEFAULT 'INITIAL';
ALTER TABLE public_result_submissions ADD COLUMN observed_result_id TEXT;
ALTER TABLE public_result_submissions ADD COLUMN observed_validation_status TEXT;
ALTER TABLE public_result_submissions ADD COLUMN observed_home_score INTEGER;
ALTER TABLE public_result_submissions ADD COLUMN observed_away_score INTEGER;

ALTER TABLE telegram_public_result_sessions ADD COLUMN home_score INTEGER;
ALTER TABLE telegram_public_result_sessions ADD COLUMN away_score INTEGER;

CREATE TABLE IF NOT EXISTS actor_scope_grants (
  grant_id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('PLATFORM','COMPETITION','CLUB','MATCH')),
  scope_id TEXT NOT NULL,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  trust_level TEXT NOT NULL DEFAULT 'VERIFIED',
  source_label TEXT,
  granted_by TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(telegram_user_id, role, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_actor_scope_grants_actor
  ON actor_scope_grants(telegram_user_id, role, active);
CREATE INDEX IF NOT EXISTS idx_actor_scope_grants_scope
  ON actor_scope_grants(scope_type, scope_id, active);
