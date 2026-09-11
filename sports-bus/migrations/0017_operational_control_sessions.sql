-- PLATFORM-OPERATOR-RUNTIME-01
-- Button-first operational control state. This is intentionally separate from
-- public observations: the actor is exercising operational authority.

CREATE TABLE IF NOT EXISTS telegram_operational_result_sessions (
  telegram_user_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  action TEXT NOT NULL CHECK(action IN ('REGISTER','CORRECT')),
  phase TEXT NOT NULL CHECK(phase IN ('HOME_SCORE','AWAY_SCORE','REASON','CONFIRM')),
  home_score INTEGER CHECK(home_score IS NULL OR home_score >= 0),
  away_score INTEGER CHECK(away_score IS NULL OR away_score >= 0),
  reason TEXT,
  base_version INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);
