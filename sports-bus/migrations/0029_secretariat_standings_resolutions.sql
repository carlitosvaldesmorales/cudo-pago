-- Secretariat standings resolutions via Telegram.
-- Scores remain historical truth; administrative point transfers are explicit standings adjustments.

CREATE TABLE IF NOT EXISTS secretariat_standings_resolutions (
  resolution_id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  season_id TEXT,
  group_id TEXT,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  championship_code TEXT NOT NULL CHECK(championship_code IN ('PRINCIPAL','SENIOR')),
  resolution_type TEXT NOT NULL CHECK(resolution_type IN ('TRANSFER_POINTS')),
  sanctioned_team_id TEXT NOT NULL,
  beneficiary_team_id TEXT NOT NULL,
  points_amount INTEGER NOT NULL CHECK(points_amount > 0),
  reason TEXT NOT NULL,
  source_home_score INTEGER NOT NULL CHECK(source_home_score >= 0),
  source_away_score INTEGER NOT NULL CHECK(source_away_score >= 0),
  source_governance_version INTEGER NOT NULL CHECK(source_governance_version >= 1),
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  source_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVERSED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(match_id),
  FOREIGN KEY(sanctioned_team_id) REFERENCES teams(team_id),
  FOREIGN KEY(beneficiary_team_id) REFERENCES teams(team_id)
);

CREATE INDEX IF NOT EXISTS idx_secretariat_resolutions_match
  ON secretariat_standings_resolutions(match_id,series_code,status,created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_secretariat_active_transfer
  ON secretariat_standings_resolutions(match_id,series_code,sanctioned_team_id,beneficiary_team_id,resolution_type)
  WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS telegram_secretariat_sessions (
  telegram_user_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  sanctioned_team_id TEXT NOT NULL,
  beneficiary_team_id TEXT NOT NULL,
  points_amount INTEGER NOT NULL CHECK(points_amount > 0),
  expected_governance_version INTEGER NOT NULL CHECK(expected_governance_version >= 1),
  phase TEXT NOT NULL CHECK(phase IN ('AWAIT_REASON','CONFIRM')),
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(match_id),
  FOREIGN KEY(sanctioned_team_id) REFERENCES teams(team_id),
  FOREIGN KEY(beneficiary_team_id) REFERENCES teams(team_id)
);
