-- MEDIA-PARTNER-COLLABORATION-ROOT-02
-- Corrects the collaboration model: partner identity is persistent at competition scope;
-- match coverage is a separate operational assignment and never creates or removes the partner relationship.

ALTER TABLE actor_scope_grants ADD COLUMN partner_code TEXT;

CREATE TABLE IF NOT EXISTS partner_match_coverages (
  coverage_id TEXT PRIMARY KEY,
  partner_code TEXT NOT NULL,
  competition_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED','LIVE','CLOSED','CANCELLED')),
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(partner_code, match_id),
  FOREIGN KEY(partner_code) REFERENCES partner_definitions(partner_code)
);

CREATE INDEX IF NOT EXISTS idx_partner_match_coverages_partner
  ON partner_match_coverages(partner_code,status,match_id);
CREATE INDEX IF NOT EXISTS idx_partner_match_coverages_match
  ON partner_match_coverages(match_id,status);

-- Retire the first, incorrect model in which a MEDIA_PARTNER relationship was
-- granted per match. Those rows are not promoted because identity/relationship
-- and work assignment are different concerns.
UPDATE partner_scope_invites
SET status='REVOKED', revoked_by='SYSTEM-MODEL-CORRECTION', revoked_at=datetime('now')
WHERE role='MEDIA_PARTNER' AND scope_type='MATCH' AND status='PENDING';

UPDATE actor_scope_grants
SET active=0, updated_at=datetime('now')
WHERE role='MEDIA_PARTNER' AND scope_type='MATCH' AND active=1;
