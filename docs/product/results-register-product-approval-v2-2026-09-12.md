# RESULTS-REGISTER · Product correction v2 · 2026-09-12

Estado: APROBADO PARA IMPLEMENTACIÓN.

## Evidencia humana observada

En runtime Telegram, al cargar `Juventud de Chépica — Independiente`, el operador debía seleccionar serie, goles local, goles visita y confirmación en mensajes sucesivos. El chat acumulaba bloques y, después de una sola serie, el contexto del partido quedaba fragmentado.

## Causa raíz aceptada

La UX v1 reflejaba la granularidad técnica/persistente (`serie → home_score → away_score`) en vez de la unidad de trabajo humana (`partido completo`). Telegram fue tratado como transcript conversacional y no como superficie transaccional viva.

## Decisión de producto

1. La unidad humana de RESULTS-REGISTER pasa a ser `MATCH`.
2. La persistencia continúa siendo por `MATCH + SERIES`.
3. Telegram reutiliza un único mensaje vivo durante el Golden Path cuando la API lo permite.
4. Confirmar una serie vuelve automáticamente al tablero del mismo partido.
5. Cancelar una serie no borra series previamente confirmadas.
6. `INFORMADO` y `OFICIAL` siguen siendo autoridades distintas.
7. Scope, role, provenance y policy no crean variantes del flujo.

Contrato vinculante: `docs/product/results-register-visual-contract-v2.md`.
Gate arquitectónico: `docs/architecture/human-intent-adapter-gate-v1.md`.
