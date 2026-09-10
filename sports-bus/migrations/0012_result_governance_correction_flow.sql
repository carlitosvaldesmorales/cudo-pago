-- M4 / RESULT-GOVERNANCE-CORRECTION-01
-- Extend the existing correction session without replacing its legacy contract.
-- The new phase/pending fields allow: score -> reason -> explicit confirmation.

ALTER TABLE telegram_result_governance_sessions
  ADD COLUMN phase TEXT NOT NULL DEFAULT 'SCORE'
  CHECK(phase IN ('SCORE','REASON','CONFIRM'));

ALTER TABLE telegram_result_governance_sessions
  ADD COLUMN pending_home_score INTEGER
  CHECK(pending_home_score IS NULL OR pending_home_score >= 0);

ALTER TABLE telegram_result_governance_sessions
  ADD COLUMN pending_away_score INTEGER
  CHECK(pending_away_score IS NULL OR pending_away_score >= 0);

ALTER TABLE telegram_result_governance_sessions
  ADD COLUMN pending_reason TEXT;

ALTER TABLE telegram_result_governance_sessions
  ADD COLUMN base_version INTEGER;
