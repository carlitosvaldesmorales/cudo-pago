# Fútbol Chépica — Control Plane Pattern

## Principio

La administración no se construye desde los registros que ya llegaron. Se construye desde el universo que **debería existir** y se superpone encima el estado real observado.

Patrón:

`INVENTARIO ESPERADO -> ESTADO OBSERVADO -> GAP -> ACCIÓN`

## Invariantes

1. **Control Plane != Data Plane**: el ADMIN GLOBAL gobierna el estado completo del campeonato; un dirigente de club aporta/gestiona sólo su ámbito.
2. **Entidad canónica != proyección**: un partido/club/tenant existe una sola vez y luego se proyecta a Telegram, Web, API, club y campeonato.
3. **Ausencia de dato también es estado**: una serie sin resultado no desaparece; existe como slot `MISSING` y debe ser gobernable.

## Contrato vigente — fase de grupos ANFA Chépica 2026

Confirmado funcionalmente: cada partido normal de la fase de grupos tiene siempre cuatro series esperadas:

- TERCERA
- SEGUNDA
- SENIOR
- PRIMERA

Los libres/byes se modelan en `byes` y no generan slots de resultado.

Por lo tanto:

`matches(competition=ANFA-CHEPICA-2026) x 4 series = slots esperados`

Luego se hace `LEFT JOIN` lógico con `match_series_results` para obtener el estado observado.

## Estados canónicos de un slot de resultado

- `MISSING` — existe por contrato, aún no hay resultado gobernado.
- `OFFICIAL` — existe `match_series_results` VERIFIED.
- `DISPUTED` — existe y está en disputa.
- `ANNULLED` — existe y está anulado.

Las acciones se derivan del estado y del rol, no de la existencia física del registro.
