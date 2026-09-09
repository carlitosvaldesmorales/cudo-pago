-- RESULTADOS-01: captura por serie desde Telegram sin duplicar la fuente de verdad.

CREATE TABLE IF NOT EXISTS series_reports (
  report_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  reporter_id TEXT NOT NULL,
  reporter_club_id TEXT,
  home_score INTEGER NOT NULL CHECK(home_score >= 0),
  away_score INTEGER NOT NULL CHECK(away_score >= 0),
  report_status TEXT NOT NULL DEFAULT 'PROVISIONAL',
  source_channel TEXT NOT NULL DEFAULT 'telegram',
  source_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(match_id, series_code, reporter_id),
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);

CREATE INDEX IF NOT EXISTS idx_series_reports_match
  ON series_reports(match_id, series_code, report_status);
CREATE INDEX IF NOT EXISTS idx_series_reports_reporter
  ON series_reports(reporter_id, updated_at);

CREATE TABLE IF NOT EXISTS telegram_series_sessions (
  telegram_user_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  state TEXT NOT NULL DEFAULT 'AWAIT_SCORE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);
