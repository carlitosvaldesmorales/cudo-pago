-- MEDIA-PARTNER-CORRESPONDENTS-HUB-03
-- Organization coverage and human correspondent assignment are different concepts.
-- A coverage belongs to the partner organization; one or more active members may be
-- assigned to operate it. Partner-wide read scope never implies write scope for every member.

CREATE TABLE IF NOT EXISTS partner_coverage_assignments (
  assignment_id TEXT PRIMARY KEY,
  coverage_id TEXT NOT NULL,
  partner_code TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RELEASED')),
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  released_by TEXT,
  released_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(coverage_id, telegram_user_id),
  FOREIGN KEY(coverage_id) REFERENCES partner_match_coverages(coverage_id),
  FOREIGN KEY(partner_code) REFERENCES partner_definitions(partner_code)
);

CREATE INDEX IF NOT EXISTS idx_partner_coverage_assignments_member
  ON partner_coverage_assignments(partner_code,telegram_user_id,status,coverage_id);
CREATE INDEX IF NOT EXISTS idx_partner_coverage_assignments_coverage
  ON partner_coverage_assignments(coverage_id,status,telegram_user_id);
