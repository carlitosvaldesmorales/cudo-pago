# PUBLIC-CHAMPIONSHIP-WEB-01

Fecha: 2026-09-10
Estado: **DESPLEGADO + CI PASS + RUNTIME PASS / UAT VISUAL DIFERIDA**

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

## Evidencia automática de contrato

`qa/web/public-championship-readmodel-harness.mjs` valida sobre D1 efímero con todas las migraciones:

1. 25 partidos y 5 libres de ANFA Chépica.
2. Cuatro series por partido.
3. `VERIFIED` publica marcador.
4. `DISPUTED`, `ANNULLED` y `PENDING` ocultan marcador.
5. No existe fuga de identidad, fuentes internas o campos de gobierno.
6. CORS habilita CUDO/GitHub Pages y no habilita orígenes desconocidos.
7. V8 consume el read model y no el endpoint agregado legado.

Workflow: `Validate Public Championship Web`.

## Evidencia de despliegue y runtime

PR #36 fue integrado en `feature/sports-event-bus-v1` con merge SHA `8c3c4c13be10595170fee19f9763262ad8812b3b`.

`Deploy Sports Event Bus` run `34521510639` (#71) terminó **SUCCESS** y desplegó Worker version `253e3bc2-8d86-4785-9fc0-77161f03c54b`.

El gate remoto D1 del mismo deploy comprobó:

- 25 partidos ANFA Chépica.
- 5 libres.
- 11 equipos.
- 25 series `VERIFIED` distribuidas en 7 partidos con resultados.
- 0 estados de gobierno inválidos.
- 0 versiones inválidas.
- 0 resultados sin su versión vigente.
- 0 series fuera de Tercera/Segunda/Senior/Primera.

El harness `qa/web/public-championship-runtime-harness.mjs`, ejecutado contra el Worker realmente desplegado por `Validate Public Championship Runtime` run `34521844017`, terminó **SUCCESS** y comprobó:

- endpoint HTTPS `GET /api/v1/public-championship` operativo;
- `contract = public-championship-v1`;
- `competition_id = ANFA-CHEPICA-2026`;
- 25 partidos / 5 libres;
- resumen de series: `OFFICIAL=24`, `IN_REVIEW=0`, `ANNULLED=0`, `PENDING=76`;
- fixture QA ausente;
- campos internos de identidad/fuente ausentes;
- CORS válido para `https://cudo.cl`.

La diferencia entre 25 filas `VERIFIED` del gate D1 y 24 series públicas oficiales es intencionalmente observable: el fixture QA aislado posee una serie `VERIFIED`, pero la proyección pública la excluye por `competition_id`.

## Regla de evidencia

- **MATERIALIZADO**: código y contrato existen en repositorio.
- **VALIDADO**: CI determinista valida estados y privacidad.
- **DESPLEGADO**: Worker productivo contiene el endpoint y D1 pasó gate remoto.
- **RUNTIME PASS**: un runner externo consultó el endpoint productivo y validó su respuesta real.
- La apariencia final en navegador/iPhone queda **DIFERIDA** mientras no haya disponibilidad del usuario para UAT visual; no bloquea el contrato de datos.
