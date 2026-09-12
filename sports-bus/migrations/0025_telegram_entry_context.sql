-- TELEGRAM-ENTRY-CONTEXT-01
-- The real actor identity never changes when a privileged operator enters a product audience.
-- Context is navigation/audit metadata, not an authorization grant.

CREATE TABLE IF NOT EXISTS telegram_entry_contexts (
  telegram_user_id TEXT PRIMARY KEY,
  context_code TEXT NOT NULL CHECK(context_code IN ('PUBLIC_GENERAL','CHEPICA_PLAY')),
  activated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

ALTER TABLE public_result_submissions
  ADD COLUMN entry_context TEXT NOT NULL DEFAULT 'PUBLIC_GENERAL';

ALTER TABLE events
  ADD COLUMN entry_context TEXT NOT NULL DEFAULT 'PUBLIC_GENERAL';

CREATE TRIGGER IF NOT EXISTS trg_public_submission_entry_context
AFTER INSERT ON public_result_submissions
WHEN EXISTS (
  SELECT 1
  FROM telegram_entry_contexts c
  WHERE c.telegram_user_id = NEW.submitter_id
    AND datetime(c.expires_at) > datetime('now')
)
BEGIN
  UPDATE public_result_submissions
  SET entry_context = (
        SELECT c.context_code
        FROM telegram_entry_contexts c
        WHERE c.telegram_user_id = NEW.submitter_id
          AND datetime(c.expires_at) > datetime('now')
        LIMIT 1
      ),
      source_channel = CASE
        WHEN (
          SELECT c.context_code
          FROM telegram_entry_contexts c
          WHERE c.telegram_user_id = NEW.submitter_id
            AND datetime(c.expires_at) > datetime('now')
          LIMIT 1
        ) = 'CHEPICA_PLAY'
        THEN 'telegram:chepica_play'
        ELSE source_channel
      END
  WHERE submission_id = NEW.submission_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_observation_event_entry_context
AFTER INSERT ON events
WHEN NEW.event_type = 'match.series.result.observed'
 AND EXISTS (
  SELECT 1
  FROM telegram_entry_contexts c
  WHERE c.telegram_user_id = NEW.actor_id
    AND datetime(c.expires_at) > datetime('now')
)
BEGIN
  UPDATE events
  SET entry_context = (
    SELECT c.context_code
    FROM telegram_entry_contexts c
    WHERE c.telegram_user_id = NEW.actor_id
      AND datetime(c.expires_at) > datetime('now')
    LIMIT 1
  )
  WHERE event_id = NEW.event_id;
END;

CREATE INDEX IF NOT EXISTS idx_public_result_submissions_entry_context
  ON public_result_submissions(entry_context, created_at);

CREATE INDEX IF NOT EXISTS idx_events_entry_context
  ON events(entry_context, occurred_at);
