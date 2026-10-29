-- ANFA Chepica 2026: segunda rueda (localias invertidas).
-- Fuente: declaracion de regla por responsable CUDO, 2026-10-29.
-- Calendario de fechas por regla del propietario (domingo semanal desde 2026-11-01).
-- No se infiere hora de inicio. kickoff_at almacena solo YYYY-MM-DD.
-- La suspensiones se corrigen en su propia fecha sin alterar match_id ni resultados.
-- Idempotente; se niega la insercion si la primera rueda no tiene 25 partidos.
INSERT OR IGNORE INTO matches (
  match_id,competition_id,season_id,round_label,kickoff_at,
  home_id,home_name,away_id,away_name,status,home_score,away_score,
  validation_status,source_event_id,updated_at,group_id,round_no,source_label,source_ref
)
SELECT
  m.group_id || '-F' || (m.round_no+5) || substr(m.match_id,instr(m.match_id,'-M')),
  m.competition_id,m.season_id,
  'Fecha ' || CASE m.round_no
    WHEN 1 THEN 'VI' WHEN 2 THEN 'VII' WHEN 3 THEN 'VIII'
    WHEN 4 THEN 'IX' WHEN 5 THEN 'X' END,
  date('2026-11-01', '+' || ((m.round_no-1)*7) || ' days'),
  m.away_id,m.away_name,m.home_id,m.home_name,
  'SCHEDULED',NULL,NULL,'PENDING',NULL,datetime('now'),
  m.group_id,m.round_no+5,'Segunda rueda: inversion de localias',
  'CUDO:regla-confirmada-2026-10-29:domingo-semanal-sin-hora'
FROM matches AS m
WHERE m.competition_id='ANFA-CHEPICA-2026'
  AND m.round_no BETWEEN 1 AND 5
  AND m.group_id IN ('A','B')
  AND instr(m.match_id,'-M')>0
  AND (SELECT COUNT(*) FROM matches
       WHERE competition_id='ANFA-CHEPICA-2026' AND round_no BETWEEN 1 AND 5)=25
  AND (SELECT COUNT(*) FROM byes
       WHERE competition_id='ANFA-CHEPICA-2026' AND round_no BETWEEN 1 AND 5)=5;

INSERT OR IGNORE INTO byes (
  bye_id,competition_id,season_id,group_id,round_no,team_id,source_label,created_at
)
SELECT
  b.bye_id || '-R2',b.competition_id,b.season_id,b.group_id,
  b.round_no+5,b.team_id,'Segunda rueda: fecha libre equivalente',datetime('now')
FROM byes AS b
WHERE b.competition_id='ANFA-CHEPICA-2026'
  AND b.round_no BETWEEN 1 AND 5
  AND (SELECT COUNT(*) FROM byes
       WHERE competition_id='ANFA-CHEPICA-2026' AND round_no BETWEEN 1 AND 5)=5
  AND (SELECT COUNT(*) FROM matches
       WHERE competition_id='ANFA-CHEPICA-2026' AND round_no BETWEEN 1 AND 5)=25;
