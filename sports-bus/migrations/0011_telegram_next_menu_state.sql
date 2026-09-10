-- TELEGRAM-BOT-MIGRATION-01
-- During blue/green migration, the old and new bot must keep independent
-- per-chat native-menu synchronization state. Authorization still lives in
-- reporters/RBAC; this is only a Telegram presentation cache.

CREATE TABLE IF NOT EXISTS telegram_menu_state_next (
  telegram_user_id TEXT PRIMARY KEY,
  menu_profile TEXT NOT NULL CHECK (menu_profile IN ('PUBLIC','CLUB_ADMIN','SUPER_ADMIN')),
  menu_version INTEGER NOT NULL DEFAULT 1,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_menu_state_next_profile
  ON telegram_menu_state_next(menu_profile);
