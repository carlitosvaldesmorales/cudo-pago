-- TELEGRAM-ENTRY-CONTEXT-02
-- Align persistence with the canonical audience/navigation contract.
-- Context is navigation/audit metadata, never an authorization grant.
-- 0025 omitted DIRIGENTES from the CHECK constraint even though the canonical
-- navigation contract already declared it as a valid audience context.

DROP TRIGGER IF EXISTS trg_public_submission_entry_context;
DROP TRIGGER IF EXISTS trg_observation_event_entry_context;

ALTER TABLE telegram_entry_contexts RENAME TO telegram_entry_contexts_v1;

CREATE TABLE telegram_entry_contexts (
  telegram_user_id TEXT PRIMARY KEY,
  context_code TEXT NOT NULL CHECK(context_code IN ('PUBLIC_GENERAL','DIRIGENTES','CHEPICA_PLAY')),
  activated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

INSERT INTO telegram_entry_contexts (telegram_user_id,context_code,activated_at,expires_at)
SELECT telegram_user_id,context_code,activated_at,expires_at
FROM telegram_entry_contexts_v1
WHERE context_code IN ('PUBLIC_GENERAL','DIRIGENTES','CHEPICA_PLAY');

DROP TABLE telegram_entry_contexts_v1;

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
