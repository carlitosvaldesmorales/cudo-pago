CREATE TABLE IF NOT EXISTS admin_invites (
  token TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'CLUB_ADMIN',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_by TEXT,
  used_at TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_admin_invites_active ON admin_invites(active, expires_at);
