-- TELEGRAM-PORTAL-01: enrollment de dirigentes desde el mismo bot.

CREATE TABLE IF NOT EXISTS access_requests (
  request_id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  display_name TEXT,
  username TEXT,
  requested_club_id TEXT NOT NULL,
  requested_role TEXT NOT NULL DEFAULT 'CLUB_ADMIN',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  FOREIGN KEY(requested_club_id) REFERENCES teams(team_id)
);

CREATE INDEX IF NOT EXISTS idx_access_requests_user
  ON access_requests(telegram_user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_access_requests_status
  ON access_requests(status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_one_pending
  ON access_requests(telegram_user_id)
  WHERE status='PENDING';
