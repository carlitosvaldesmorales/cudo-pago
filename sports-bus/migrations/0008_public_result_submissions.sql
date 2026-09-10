-- G2 / PUBLIC-RESULT-SUBMISSION-01
-- Public users may report a score, but it never becomes public until an authorized
-- club/global administrator approves it. The submission history remains traceable.

CREATE TABLE IF NOT EXISTS public_result_submissions (
  submission_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  submitter_id TEXT NOT NULL,
  submitter_name TEXT,
  home_score INTEGER NOT NULL CHECK(home_score >= 0),
  away_score INTEGER NOT NULL CHECK(away_score >= 0),
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','APPROVED','REJECTED','SUPERSEDED','CANCELLED')),
  source_channel TEXT NOT NULL DEFAULT 'telegram',
  source_event_id TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_role TEXT,
  reviewed_club_id TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);

CREATE INDEX IF NOT EXISTS idx_public_result_submissions_status
  ON public_result_submissions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_public_result_submissions_match
  ON public_result_submissions(match_id, series_code, status);
CREATE INDEX IF NOT EXISTS idx_public_result_submissions_submitter
  ON public_result_submissions(submitter_id, created_at);

-- One unresolved contribution per person/match/series. Different people may still
-- report the same match independently; an authorized reviewer chooses the winner.
CREATE UNIQUE INDEX IF NOT EXISTS uq_public_result_submission_pending_per_user
  ON public_result_submissions(match_id, series_code, submitter_id)
  WHERE status='SUBMITTED';

CREATE TABLE IF NOT EXISTS telegram_public_result_sessions (
  telegram_user_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  series_code TEXT NOT NULL CHECK(series_code IN ('TERCERA','SEGUNDA','SENIOR','PRIMERA')),
  state TEXT NOT NULL DEFAULT 'AWAIT_SCORE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(match_id) REFERENCES matches(match_id)
);
