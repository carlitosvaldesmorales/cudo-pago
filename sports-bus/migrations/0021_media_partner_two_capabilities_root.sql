-- MEDIA-PARTNER-TWO-CAPABILITIES-ROOT-04
-- Correct product contract for Chépica Play:
--   READ_COMPETITION + OBSERVE_RESULT only.
-- Transmission context, correspondents, coverages and live-event capture are not
-- current product requirements and must not grant operational scope.

UPDATE actor_scope_grants
SET capabilities_json='["READ_COMPETITION","OBSERVE_RESULT"]',
    updated_at=datetime('now')
WHERE role='MEDIA_PARTNER'
  AND scope_type='COMPETITION'
  AND partner_code='CHEPICA_PLAY';

UPDATE partner_scope_invites
SET capabilities_json='["READ_COMPETITION","OBSERVE_RESULT"]'
WHERE role='MEDIA_PARTNER'
  AND scope_type='COMPETITION'
  AND partner_code='CHEPICA_PLAY'
  AND status IN ('PENDING','CLAIMED');

-- Retire operational concepts introduced ahead of the declared product scope.
-- Keep rows for audit/history; make them inactive rather than deleting evidence.
UPDATE partner_match_coverages
SET status='CANCELLED',
    ended_at=COALESCE(ended_at,datetime('now')),
    updated_at=datetime('now')
WHERE partner_code='CHEPICA_PLAY'
  AND status IN ('ASSIGNED','LIVE','CLOSED');

UPDATE partner_coverage_assignments
SET status='RELEASED',
    released_by=COALESCE(released_by,'SYSTEM-MODEL-CORRECTION'),
    released_at=COALESCE(released_at,datetime('now')),
    updated_at=datetime('now')
WHERE partner_code='CHEPICA_PLAY'
  AND status='ACTIVE';
