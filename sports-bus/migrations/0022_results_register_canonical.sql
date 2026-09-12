-- RESULTS-REGISTER canonical session state.
-- One session per Telegram identity. Nonces make stale callbacks fail closed.

CREATE TABLE IF NOT EXISTS telegram_result_register_sessions (
  telegram_user_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  state TEXT NOT NULL CHECK(state IN ('HOME_SCORE','AWAY_SCORE','HOME_HIGH','AWAY_HIGH','CONFIRM','APPLYING')),
  home_score INTEGER,
  away_score INTEGER,
  nonce TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);

CREATE INDEX IF NOT EXISTS idx_result_register_session_match
  ON telegram_result_register_sessions(match_id,series_code,state);
