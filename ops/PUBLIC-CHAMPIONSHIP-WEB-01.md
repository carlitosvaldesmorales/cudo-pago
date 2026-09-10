# PUBLIC-CHAMPIONSHIP-WEB-01

Fecha: 2026-09-10
Estado: **MATERIALIZADO + CI PASS / RUNTIME PENDIENTE DE MERGE-DEPLOY / UAT VISUAL DIFERIDA**

## Problema observado

La V8 del campeonato consumía `GET /api/v1/matches`. Esa ruta pertenece al modelo agregado legado de `matches` y expone un único `home_score / away_score / validation_status` por partido.

El gobierno vigente de resultados, en cambio, opera por serie sobre `match_series_results`:

- TERCERA
- SEGUNDA
- SENIOR
- PRIMERA

Por tanto, la V8 podía mostrar una representación de partido que no era equivalente a la fuente gobernada por serie.

## Decisión

Crear una proyección pública read-only específica:

`GET /api/v1/public-championship`

La proyección se restringe a `ANFA-CHEPICA-2026` y combina únicamente:

- `competitions`
- `matches`
- `byes`
- `teams` para nombre de libre
- `match_series_results`

No modifica datos y no reemplaza las tablas de gobierno.

## Contrato público de serie

El backend traduce estados internos a un contrato público mínimo:

| Estado interno | Estado público | Marcador público |
|---|---|---|
| `VERIFIED` | `OFFICIAL` | Sí |
| `DISPUTED` | `IN_REVIEW` | No |
| `ANNULLED` | `ANNULLED` | No |
| sin registro / otro | `PENDING` | No |

Un marcador retenido internamente durante una disputa o anulación nunca se entrega al frontend público.

## Datos deliberadamente excluidos

La proyección no expone:

- `actor_id` / `actor_role`
- Telegram IDs
- `source_ref`, `source_type`, `source_label`
- `validation_status` interno
- motivos de gobierno
- auditoría/permisos

El fixture QA usa otra competencia y queda fuera por filtro explícito de `competition_id`.

## V8

`preview-v8/shared/championship.js` deja de consumir `/api/v1/matches` para el campeonato y pasa a consumir `/api/v1/public-championship`.

Cada partido se presenta con las cuatro series. Sólo `OFFICIAL` muestra marcador. `IN_REVIEW`, `ANNULLED` y `PENDING` muestran estado sin resultado numérico.

Si la API no está disponible, `championship-fixture.json` sirve únicamente como snapshot del fixture: el fallback no reutiliza marcadores agregados ni inventa resultados por serie; todas las series quedan `PENDING` hasta recuperar el read model.

## Evidencia automática

`qa/web/public-championship-readmodel-harness.mjs` valida sobre D1 efímero con todas las migraciones:

1. 25 partidos y 5 libres de ANFA Chépica.
2. Cuatro series por partido.
3. `VERIFIED` publica marcador.
4. `DISPUTED`, `ANNULLED` y `PENDING` ocultan marcador.
5. No existe fuga de identidad, fuentes internas o campos de gobierno.
6. CORS habilita CUDO/GitHub Pages y no habilita orígenes desconocidos.
7. V8 consume el read model y no el endpoint agregado legado.

Workflow: `Validate Public Championship Web`.

## Regla de evidencia

- El PASS de CI valida el contrato y el renderer a nivel estático/determinista.
- El endpoint sólo se considera **DESPLEGADO** después del merge a `feature/sports-event-bus-v1` y del deploy exitoso del Worker.
- La apariencia final en navegador/iPhone queda **DIFERIDA** mientras no haya disponibilidad del usuario para UAT visual; no bloquea el contrato de datos.
