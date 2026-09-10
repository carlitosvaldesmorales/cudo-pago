# RESULT-GOVERNANCE-01

Fecha: 2026-09-09
Gate: G3 de `FUTBOL-CHEPICA-MULTICLUB-01`
Estado: DESPLEGADO + QA AUTOMATIZADO PASS + NAVEGACIÓN HUMANA SEGURA PASS / MUTACIÓN REAL DIFERIDA

## Problema que cierra G3

Antes de este hito un resultado ya `VERIFIED` podía llegar nuevamente por el flujo administrativo de ingreso de marcador y terminar actualizado mediante un UPSERT. Eso modificaba la fuente actual sin conservar una versión formal anterior.

Desde G3 rige esta regla:

> Un resultado oficial existente nunca se sobrescribe silenciosamente. Cualquier cambio posterior debe pasar por gobierno de resultados y crear una nueva versión inmutable.

`match_series_results` sigue siendo la proyección del estado actual que consume la API. `match_series_result_versions` conserva la historia completa.

## Estados y efecto público

```text
VERIFIED
   ├─ CORRECT  → VERIFIED (nueva versión, nuevo marcador)
   ├─ DISPUTE  → DISPUTED (sale de API/tabla)
   └─ ANNUL    → ANNULLED (sale de API/tabla)

DISPUTED
   ├─ RESOLVE  → VERIFIED (se confirma marcador actual)
   ├─ CORRECT  → VERIFIED (nuevo marcador y resolución)
   └─ ANNUL    → ANNULLED

ANNULLED
   └─ RESTORE  → VERIFIED
```

La API pública filtra por `validation_status='VERIFIED'`; por lo tanto `DISPUTED` y `ANNULLED` dejan de publicarse y computarse sin eliminar su historia.

## Matriz de autorización

| Acción | CLUB_ADMIN participante | SUPER_ADMIN | Tercer club / público |
|---|---:|---:|---:|
| Ver resultado e historial dentro de alcance | Sí | Sí | No |
| Disputar resultado VERIFIED | Sí | Sí | No |
| Corregir marcador oficial | No | Sí | No |
| Resolver disputa | No | Sí | No |
| Anular resultado | No | Sí | No |
| Restaurar resultado anulado | No | Sí | No |
| Sobrescribir por el flujo antiguo | No | No | No |

Un `CLUB_ADMIN` sólo tiene alcance cuando su `club_id` coincide con local o visita del partido.

## Persistencia

Migración `sports-bus/migrations/0009_result_governance.sql`:

- agrega `governance_version` a `match_series_results`;
- crea `match_series_result_versions` con versiones numeradas e inmutables;
- crea `telegram_result_governance_sessions` para la captura controlada de correcciones;
- crea una versión `v1 / BASELINE` de cada resultado oficial existente;
- crea automáticamente el baseline para nuevos resultados `VERIFIED` insertados en el futuro.

Cada versión registra marcador, estado, acción, razón, fuente, actor, rol, club y fecha.

## Cierre del overwrite silencioso

`handleResultGovernanceRequest` se ejecuta antes de los handlers que históricamente escribían resultados.

Si existe una sesión antigua de ingreso de marcador y la serie ya tiene un resultado materializado:

1. se elimina esa sesión;
2. no se ejecuta el UPSERT antiguo;
3. se registra un `permission_audit` denegado con acción `OVERWRITE_SERIES_RESULT`;
4. se informa al dirigente que debe usar `/correcciones`.

La protección aplica también a `SUPER_ADMIN`.

## Operación Telegram

Entrada visible desde el portal Dirigentes:

- SUPER_ADMIN: `🛡️ Correcciones y disputas`.
- CLUB_ADMIN: `⚠️ Disputar resultado oficial`.
- comando alternativo: `/correcciones`.

SUPER_ADMIN puede corregir, disputar, confirmar/resolver, anular, restaurar y consultar historial. Un administrador de club participante puede consultar historial y poner un resultado VERIFIED en disputa, pero no cambiar el marcador ni resolver por sí mismo.

## Auditoría

Cada transición aceptada genera:

- una nueva fila en `match_series_result_versions`;
- actualización de la proyección `match_series_results` con nueva `governance_version`;
- un evento específico en `events`;
- un registro permitido en `permission_audit`.

Los intentos sin alcance, sin rol suficiente o de overwrite por el camino anterior quedan denegados y auditados.

## QA automatizado

Harness: `qa/telegram/result-governance-harness.mjs`.

Prueba usando Worker real + D1 SQLite efímero + transporte Telegram simulado:

- baseline v1 de resultados preexistentes;
- bloqueo y auditoría de overwrite silencioso;
- disputa por club participante;
- denegación de un tercer club;
- exclusión pública de `DISPUTED`;
- resolución sólo por SUPER_ADMIN;
- corrección como nueva versión sin borrar el marcador anterior;
- bloqueo de bypass también para SUPER_ADMIN;
- anulación, exclusión pública y restauración;
- historial inmutable y eventos;
- regresión completa G2;
- regresión completa G1.

Evidencia antes de integrar: `Validate Result Governance` run `34424510189`, SUCCESS. En PR #10 también pasaron `Validate Result Governance`, `Validate Public Result Submission` y `Validate Telegram QA Harness`.

## Evidencia de despliegue productivo

PR #10 fue integrado en `feature/sports-event-bus-v1` mediante merge commit `62442c139bcaa04267ea4da5a7db32ce443ccf4a`.

`Deploy Sports Event Bus` run `34424861780` (#49): SUCCESS completo.

- migración remota `0009_result_governance.sql`: aplicada correctamente;
- `match_series_result_versions`: presente;
- `telegram_result_governance_sessions`: presente;
- `invalid_governance_status=0`;
- `invalid_result_versions=0`;
- `missing_current_version=0`;
- fuente deportiva conservada en 24 series VERIFIED distribuidas en 6 partidos;
- 25 partidos, 5 libres y 11 clubes en fixture;
- webhook Telegram reconciliado: ya configurado;
- `/health`, `/health/telegram`, `/api/v1/matches` y `/api/v1/series-results`: PASS;
- API pública confirmó sólo filas `VERIFIED`;
- Worker productivo: versión `4c4452fb-3964-4994-abf8-f589a6740bb1`.

El QA recurrente posterior al merge (`Validate Telegram QA Harness` run `34424861804`) también terminó SUCCESS.

No se introdujeron marcadores ni estados sintéticos en D1 productivo durante el despliegue.

## Validación humana segura — PASS 2026-09-10

Se validó visualmente en el bot productivo `Fútbol Chépica`, usando la identidad SUPER_ADMIN existente y sin ejecutar ninguna mutación:

1. `/correcciones` abrió la lista de resultados oficiales;
2. la lista mostró resultados `v1` en estado publicable;
3. se abrió un resultado real: Fecha I · Grupo A · Santa Elena La Ruda 1-0 Unión Orilla · Tercera;
4. el detalle mostró `Estado: VERIFIED` y `Publicado y computable`;
5. se renderizaron las acciones esperadas de SUPER_ADMIN: `Corregir marcador`, `Poner en disputa`, `Anular resultado` y `Ver historial`;
6. no se pulsó ninguna acción destructiva ni se alteró D1.

Con esto el gate humano seguro de navegación/render de G3 queda PASS. Una mutación G3 E2E completa sigue deliberadamente diferida hasta existir una corrección, disputa o anulación legítima; no se fabricarán estados sobre resultados reales para probar.

## Hallazgo UX observado

La validación humana también mostró una fricción real que no afecta el contrato funcional:

- la lista identifica cada resultado por fecha, serie, marcador y versión, pero no muestra los nombres de los clubes; varios ítems quedan visualmente ambiguos;
- `VERIFIED` y `v1` exponen nomenclatura técnica al usuario operativo;
- corregir, disputar y anular aparecen con el mismo peso visual aunque tengan riesgo distinto;
- el detalle es funcional pero puede simplificarse para lectura rápida en móvil.

Este hallazgo se trata como mejora UX independiente y no reabre G3 funcional.
