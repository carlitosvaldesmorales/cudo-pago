-- RESULTADOS-01: normalizar identidad de club de reporteros al team_id canónico del fixture.
-- CUDO es el nombre/alias del club; el identificador técnico del equipo en ANFA Chépica 2026 es UNION-ORILLA.

UPDATE reporters
SET club_id = 'UNION-ORILLA', updated_at = datetime('now')
WHERE club_id = 'CUDO';
