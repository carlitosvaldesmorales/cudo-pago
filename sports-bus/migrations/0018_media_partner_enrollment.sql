-- MEDIA-PARTNER-ENROLLMENT-01
-- Partner identities are bound through explicit, one-time, scoped invitations.
-- The invitation does not alter platform policy; it instantiates an existing
-- MEDIA_PARTNER capability profile for a concrete resource scope.

CREATE TABLE IF NOT EXISTS partner_definitions (
  partner_code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  partner_type TEXT NOT NULL DEFAULT 'MEDIA',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO partner_definitions
  (partner_code,display_name,partner_type,active,created_at,updated_at)
VALUES
  ('CHEPICA_PLAY','Chépica Play','MEDIA',1,datetime('now'),datetime('now'));

CREATE TABLE IF NOT EXISTS partner_scope_invites (
  invite_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  partner_code TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'MEDIA_PARTNER' CHECK(role='MEDIA_PARTNER'),
  scope_type TEXT NOT NULL CHECK(scope_type IN ('MATCH','COMPETITION')),
  scope_id TEXT NOT NULL,
  capabilities_json TEXT NOT NULL DEFAULT '["OBSERVE_RESULT","PUBLISH_MATCH_EVENT"]',
  trust_level TEXT NOT NULL DEFAULT 'VERIFIED',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CLAIMED','REVOKED','EXPIRED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_by TEXT,
  claimed_at TEXT,
  revoked_by TEXT,
  revoked_at TEXT,
  FOREIGN KEY(partner_code) REFERENCES partner_definitions(partner_code)
);

CREATE INDEX IF NOT EXISTS idx_partner_scope_invites_status
  ON partner_scope_invites(status,expires_at);
CREATE INDEX IF NOT EXISTS idx_partner_scope_invites_partner
  ON partner_scope_invites(partner_code,status);
