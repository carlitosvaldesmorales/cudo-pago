-- MATCH-DISCIPLINE-EXPULSIONS-01
-- Canonical Telegram registry of expulsions by match/series.
-- Records the factual disciplinary incident only. It does not infer suspension dates,
-- fines, eligibility or standings consequences without a competition-specific rule.

CREATE TABLE IF NOT EXISTS match_disciplinary_incidents (
  incident_id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  season_id TEXT,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  participant_name TEXT NOT NULL,
  participant_name_key TEXT NOT NULL,
  incident_kind TEXT NOT NULL DEFAULT 'EXPULSION' CHECK(incident_kind IN ('EXPULSION')),
  card_type TEXT NOT NULL CHECK(card_type IN ('SECOND_YELLOW','DIRECT_RED','OTHER_EXPULSION')),
  incident_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(incident_status IN ('ACTIVE','VOID')),
  sanction_state TEXT NOT NULL DEFAULT 'RECORDED_PENDING_RULE_DECISION',
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  voided_at TEXT,
  voided_by TEXT,
  void_reason TEXT,
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_discipline_active_player
  ON match_disciplinary_incidents(match_id,series_code,team_id,participant_name_key)
  WHERE incident_status='ACTIVE';

CREATE INDEX IF NOT EXISTS idx_match_discipline_match
  ON match_disciplinary_incidents(match_id,incident_status,series_code,created_at);

CREATE INDEX IF NOT EXISTS idx_match_discipline_participant
  ON match_disciplinary_incidents(participant_name_key,incident_status,created_at);

CREATE TABLE IF NOT EXISTS telegram_discipline_sessions (
  telegram_user_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  team_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('AWAIT_NAME','AWAIT_CARD','CONFIRM','APPLYING')),
  participant_name TEXT,
  participant_name_key TEXT,
  card_type TEXT,
  nonce TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_discipline_session_match
  ON telegram_discipline_sessions(match_id,series_code);
