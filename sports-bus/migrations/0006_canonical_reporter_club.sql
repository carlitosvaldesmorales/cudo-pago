-- Canonicaliza el alcance de identidad del club en reporters.
-- El fixture/teams usa UNION-ORILLA como team_id; el bootstrap histórico usó CUDO.
-- Mantener ambos conceptos separados causaba que /mispartidos no encontrara el club del administrador.

UPDATE reporters
SET club_id = 'UNION-ORILLA', updated_at = datetime('now')
WHERE club_id = 'CUDO';

CREATE TRIGGER IF NOT EXISTS trg_reporters_cudo_alias_insert
AFTER INSERT ON reporters
WHEN NEW.club_id = 'CUDO'
BEGIN
  UPDATE reporters
  SET club_id = 'UNION-ORILLA', updated_at = datetime('now')
  WHERE telegram_user_id = NEW.telegram_user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_reporters_cudo_alias_update
AFTER UPDATE OF club_id ON reporters
WHEN NEW.club_id = 'CUDO'
BEGIN
  UPDATE reporters
  SET club_id = 'UNION-ORILLA', updated_at = datetime('now')
  WHERE telegram_user_id = NEW.telegram_user_id;
END;
