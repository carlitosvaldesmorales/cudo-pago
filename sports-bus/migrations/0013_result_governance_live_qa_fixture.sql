-- M4 / LIVE-QA-RESULT-GOVERNANCE-01
-- Isolated fixture for validating real Telegram mutations without touching ANFA Chépica data.
-- The public results view is hard-scoped to ANFA-CHEPICA-2026, so this competition is never published there.

INSERT OR IGNORE INTO competitions (
  competition_id,name,season_id,phase,source_label,active,created_at,updated_at
) VALUES (
  'CUDO-QA-RESULT-GOVERNANCE','CUDO QA · Gobierno de resultados','QA','QA','CUDO live mutation fixture · NO PUBLICAR',1,
  '2026-09-10T17:40:00Z','2026-09-10T17:40:00Z'
);

INSERT OR IGNORE INTO matches (
  match_id,competition_id,season_id,round_label,kickoff_at,home_id,home_name,away_id,away_name,status,
  home_score,away_score,validation_status,source_event_id,updated_at,group_id,round_no,source_label,source_ref
) VALUES (
  'QA-RG-MUTATION-01','CUDO-QA-RESULT-GOVERNANCE','QA','Prueba segura',NULL,
  'QA-LOCAL','QA Local','QA-VISITA','QA Visita','PLAYED',
  NULL,NULL,'VERIFIED','qa-result-governance-seed','2026-09-10T17:40:00Z','QA',0,
  'CUDO live mutation fixture · NO PUBLICAR','internal:qa:result-governance'
);

INSERT OR IGNORE INTO match_series_results (
  result_id,match_id,series_code,home_score,away_score,validation_status,source_type,source_label,source_ref,
  played_on,created_at,updated_at,governance_version
) VALUES (
  'QA-RG-MUTATION-01-TERCERA','QA-RG-MUTATION-01','TERCERA',1,1,'VERIFIED','QA_FIXTURE',
  'CUDO live mutation fixture · NO PUBLICAR','internal:qa:result-governance','2026-09-10',
  '2026-09-10T17:40:00Z','2026-09-10T17:40:00Z',1
);
