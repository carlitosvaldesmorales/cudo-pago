-- TELEGRAM-NATIVE-MENU-01
-- Cache only the menu profile already synchronized with Telegram.
-- Authorization remains in reporters/RBAC; this table is not a permission source.

CREATE TABLE IF NOT EXISTS telegram_menu_state (
  telegram_user_id TEXT PRIMARY KEY,
  menu_profile TEXT NOT NULL CHECK (menu_profile IN ('PUBLIC','CLUB_ADMIN','SUPER_ADMIN')),
  menu_version INTEGER NOT NULL DEFAULT 1,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_menu_state_profile
  ON telegram_menu_state(menu_profile);
