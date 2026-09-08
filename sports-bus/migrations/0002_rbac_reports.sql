-- Scoped RBAC + immutable/traceable result reporting.

CREATE TABLE IF NOT EXISTS match_reports (
  report_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reporter_club_id TEXT,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  report_status TEXT NOT NULL DEFAULT 'PROVISIONAL',
  evidence_ref TEXT,
  source_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(match_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_match_reports_match ON match_reports(match_id, report_status);
CREATE INDEX IF NOT EXISTS idx_match_reports_reporter ON match_reports(reporter_id);

CREATE TABLE IF NOT EXISTS permission_audit (
  audit_id TEXT PRIMARY KEY,
  actor_id TEXT,
  role TEXT,
  club_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  allowed INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_permission_audit_actor ON permission_audit(actor_id, created_at);

-- Promote the already bootstrapped verified administrator to the new global role.
UPDATE reporters
SET role = 'SUPER_ADMIN', trust_level = 'VERIFIED', updated_at = datetime('now')
WHERE role = 'ADMIN' AND trust_level = 'VERIFIED';
