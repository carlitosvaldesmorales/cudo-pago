-- Fix Secretariat semantics: award the beneficiary the series win points while preserving the historical score.
-- Existing TRANSFER_POINTS rows remain compatible, but resolution_policy becomes the authoritative semantics.

ALTER TABLE secretariat_standings_resolutions
  ADD COLUMN resolution_policy TEXT NOT NULL DEFAULT 'LEGACY_TRANSFER_ACTUAL_POINTS';

ALTER TABLE secretariat_standings_resolutions
  ADD COLUMN sanctioned_points_before INTEGER;

ALTER TABLE secretariat_standings_resolutions
  ADD COLUMN sanctioned_target_points INTEGER;

ALTER TABLE secretariat_standings_resolutions
  ADD COLUMN sanctioned_points_delta INTEGER;

ALTER TABLE secretariat_standings_resolutions
  ADD COLUMN beneficiary_points_before INTEGER;

ALTER TABLE secretariat_standings_resolutions
  ADD COLUMN beneficiary_target_points INTEGER;

ALTER TABLE secretariat_standings_resolutions
  ADD COLUMN beneficiary_points_delta INTEGER;

-- The three active real cases are all "opponent awarded the win" decisions.
-- First two already had equal debit/credit because the sanctioned club had won on the field.
UPDATE secretariat_standings_resolutions
SET
  resolution_policy='AWARD_OPPONENT_WIN',
  points_amount=3,
  sanctioned_points_before=3,
  sanctioned_target_points=0,
  sanctioned_points_delta=-3,
  beneficiary_points_before=0,
  beneficiary_target_points=3,
  beneficiary_points_delta=3,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE match_id='A-F1-M3'
  AND series_code='SEGUNDA'
  AND sanctioned_team_id='JUV-CHEPICA'
  AND beneficiary_team_id='SAN-JUAN'
  AND status='ACTIVE';

UPDATE secretariat_standings_resolutions
SET
  resolution_policy='AWARD_OPPONENT_WIN',
  points_amount=2,
  sanctioned_points_before=2,
  sanctioned_target_points=0,
  sanctioned_points_delta=-2,
  beneficiary_points_before=0,
  beneficiary_target_points=2,
  beneficiary_points_delta=2,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE match_id='A-F2-M1'
  AND series_code='TERCERA'
  AND sanctioned_team_id='JUV-CHEPICA'
  AND beneficiary_team_id='INDEPENDIENTE'
  AND status='ACTIVE';

-- Fecha III · Santa Elena La Ruda 1-1 Juventud de Chépica · Segunda.
-- On-field points were 1-1. Secretariat awarded the match to La Ruda:
-- Juventud goes from 1 to 0 (-1); La Ruda goes from 1 to the Segunda win value 3 (+2).
UPDATE secretariat_standings_resolutions
SET
  resolution_policy='AWARD_OPPONENT_WIN',
  points_amount=3,
  sanctioned_points_before=1,
  sanctioned_target_points=0,
  sanctioned_points_delta=-1,
  beneficiary_points_before=1,
  beneficiary_target_points=3,
  beneficiary_points_delta=2,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE match_id='A-F3-M1'
  AND series_code='SEGUNDA'
  AND sanctioned_team_id='JUV-CHEPICA'
  AND beneficiary_team_id='SANTA-ELENA'
  AND status='ACTIVE';

UPDATE standings_adjustments
SET
  points_delta=2,
  source_label='Secretaría · AWARD_OPPONENT_WIN',
  reason=reason || ' · Corrección de política: rival recibe puntos de victoria de Segunda',
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE adjustment_id=(
  SELECT resolution_id || ':CREDIT'
  FROM secretariat_standings_resolutions
  WHERE match_id='A-F3-M1'
    AND series_code='SEGUNDA'
    AND sanctioned_team_id='JUV-CHEPICA'
    AND beneficiary_team_id='SANTA-ELENA'
    AND status='ACTIVE'
  ORDER BY created_at DESC
  LIMIT 1
);

UPDATE standings_adjustments
SET
  source_label='Secretaría · AWARD_OPPONENT_WIN',
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE adjustment_id=(
  SELECT resolution_id || ':DEBIT'
  FROM secretariat_standings_resolutions
  WHERE match_id='A-F3-M1'
    AND series_code='SEGUNDA'
    AND sanctioned_team_id='JUV-CHEPICA'
    AND beneficiary_team_id='SANTA-ELENA'
    AND status='ACTIVE'
  ORDER BY created_at DESC
  LIMIT 1
);

-- Any in-flight Telegram session was created under the legacy transfer semantics.
DELETE FROM telegram_secretariat_sessions;

INSERT OR REPLACE INTO events
  (event_id,event_type,occurred_at,received_at,competition_id,season_id,match_id,actor_id,actor_name,club_id,validation_status,payload_json)
SELECT
  'sec-policy-fix-A-F3-M1-SEGUNDA-20261021',
  'standings.secretariat.award_win.corrected',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  competition_id,
  season_id,
  match_id,
  'SYSTEM_MIGRATION_0030',
  'CUDO canonical policy migration',
  NULL,
  'VERIFIED',
  '{"policy":"AWARD_OPPONENT_WIN","series_code":"SEGUNDA","score_preserved":[1,1],"sanctioned_team_id":"JUV-CHEPICA","sanctioned_delta":-1,"beneficiary_team_id":"SANTA-ELENA","beneficiary_delta":2,"beneficiary_target_points":3}'
FROM secretariat_standings_resolutions
WHERE match_id='A-F3-M1'
  AND series_code='SEGUNDA'
  AND sanctioned_team_id='JUV-CHEPICA'
  AND beneficiary_team_id='SANTA-ELENA'
  AND status='ACTIVE'
LIMIT 1;

INSERT OR REPLACE INTO permission_audit
  (audit_id,actor_id,role,club_id,action,resource_type,resource_id,allowed,reason,created_at)
SELECT
  'sec-policy-fix-A-F3-M1-SEGUNDA-20261021:AUDIT',
  'SYSTEM_MIGRATION_0030',
  'SYSTEM',
  NULL,
  'CORRECT_SECRETARIAT_AWARD_WIN_POLICY',
  'secretariat_resolution',
  resolution_id,
  1,
  'Correct legacy -1/+1 transfer to awarded-win semantics: Juventud 1->0; Santa Elena 1->3',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM secretariat_standings_resolutions
WHERE match_id='A-F3-M1'
  AND series_code='SEGUNDA'
  AND sanctioned_team_id='JUV-CHEPICA'
  AND beneficiary_team_id='SANTA-ELENA'
  AND status='ACTIVE'
LIMIT 1;
