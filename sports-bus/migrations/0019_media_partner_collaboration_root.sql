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

-- Existing match-scoped MEDIA_PARTNER grants from the first model are intentionally
-- not promoted automatically. No real partner identity had been enrolled when this
-- correction was introduced. Future partner relationships are competition-scoped.
