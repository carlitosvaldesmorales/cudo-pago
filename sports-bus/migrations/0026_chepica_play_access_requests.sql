-- CHEPICA-PLAY-ACCESS-REQUEST-01
-- Self-service authorization request for unlinked Telegram identities.
-- Approval creates a MEDIA_PARTNER competition grant; navigation alone never grants access.

CREATE TABLE IF NOT EXISTS partner_access_requests (
  request_id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  display_name TEXT,
  username TEXT,
  partner_code TEXT NOT NULL,
  requested_role TEXT NOT NULL DEFAULT 'MEDIA_PARTNER',
  scope_type TEXT NOT NULL DEFAULT 'COMPETITION',
  scope_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_partner_access_requests_actor
  ON partner_access_requests(telegram_user_id, partner_code, scope_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_partner_access_requests_status
  ON partner_access_requests(partner_code, scope_id, status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_access_requests_one_pending
  ON partner_access_requests(telegram_user_id, partner_code, scope_id)
  WHERE status='PENDING';
