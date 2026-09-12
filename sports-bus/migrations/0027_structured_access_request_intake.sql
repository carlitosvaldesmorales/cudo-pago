-- STRUCTURED-ACCESS-INTAKE-01
-- A restricted-audience request is drafted and confirmed before it becomes PENDING.
-- Technical Telegram identity and human-declared review context remain separate.

CREATE TABLE IF NOT EXISTS access_request_intakes (
  intake_id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  audience_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('AWAITING_NAME','AWAITING_ENTITY','REVIEW')),
  declared_name TEXT,
  represented_entity_id TEXT,
  represented_entity_label TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_request_intakes_actor_audience
  ON access_request_intakes(telegram_user_id,audience_id);

CREATE INDEX IF NOT EXISTS idx_access_request_intakes_expiry
  ON access_request_intakes(expires_at);

ALTER TABLE partner_access_requests ADD COLUMN declared_name TEXT;
ALTER TABLE partner_access_requests ADD COLUMN represented_entity TEXT;
ALTER TABLE partner_access_requests ADD COLUMN intake_id TEXT;
ALTER TABLE partner_access_requests ADD COLUMN submitted_at TEXT;

ALTER TABLE access_requests ADD COLUMN declared_name TEXT;
ALTER TABLE access_requests ADD COLUMN represented_entity_label TEXT;
ALTER TABLE access_requests ADD COLUMN intake_id TEXT;
ALTER TABLE access_requests ADD COLUMN submitted_at TEXT;

-- Requests created by the old Chépica Play one-click flow never collected
-- reviewable human context. Preserve their audit trail but remove them from
-- the actionable PENDING queue so the requester can submit through the new flow.
UPDATE partner_access_requests
SET status='CANCELLED',
    reviewed_at=datetime('now'),
    review_note='superseded_by_structured_intake_v1'
WHERE status='PENDING'
  AND submitted_at IS NULL;
