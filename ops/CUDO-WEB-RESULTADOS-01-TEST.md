# CUDO WEB — RESULTADOS-01 / PRUEBA FECHA II

## Objetivo
Probar el flujo real de captura de resultados por serie sin editar JSON ni GitHub manualmente.

## Caso de prueba autorizado
- Competencia: ANFA Chépica 2026
- Fecha: II
- Grupo: A
- Partido: `A-F2-M2`
- Local: Unión Orilla (CUDO)
- Visita: San Juan
- Actor de prueba: administrador verificado de CUDO
- Canal: Telegram

## Regla de verdad
NO se ingresan marcadores ficticios. El resultado sólo se materializa cuando el administrador escribe el marcador real.

## Regla persistente de UX y alcance por cuenta
El menú de resultados NO parte pidiendo Grupo ni mostrando el campeonato completo.

La cuenta define el alcance:
1. `reporters.club_id` identifica el club del usuario usando el `team_id` canónico del fixture.
2. `teams.group_id` determina automáticamente el grupo del club.
3. El bot consulta sólo partidos donde ese `club_id` participa como local o visita.
4. El usuario ve un menú de sus fechas del fixture.
5. Al elegir una fecha ve únicamente el partido de su club correspondiente a esa fecha.
6. Recién dentro de ese partido elige Tercera, Segunda, Senior o Primera.

Ejemplo CUDO:
`Cuenta CUDO/Unión Orilla → team_id UNION-ORILLA → Grupo A automático → Mis fechas → Fecha II → Unión Orilla vs San Juan → Serie → Marcador`

Un administrador/member de CUDO NO debe navegar ni visualizar partidos de otros clubes dentro del flujo normal `Mis partidos`.

Un `SUPER_ADMIN` asociado a Unión Orilla mantiene por defecto este mismo menú acotado al club. Las funciones globales de administración, si se requieren, deben existir en un flujo administrativo separado y explícito; no se mezclan con `Mis partidos`.

## Regla persistente de rotulado local/visita
En el botón de cada fecha se muestra siempre el partido completo respetando el orden oficial del fixture:

`Fecha · LOCAL vs VISITA`

Por lo tanto, el club asociado a la cuenta aparece:
- primero cuando es local;
- segundo cuando es visita.

Ejemplos CUDO:
- `Fecha I · Santa Elena La Ruda vs Unión Orilla` → CUDO visita.
- `Fecha II · Unión Orilla vs San Juan` → CUDO local.

No usar el formato ambiguo `Fecha · vs Rival` porque oculta la condición local/visita.

Implementación persistente:
- `sports-bus/worker/fixture-label.js`
- `sports-bus/worker/series-entry.js`
- `sports-bus/tests/fixture-label.test.mjs`
- `.github/workflows/validate-sports-bus-ux.yml`

Evidencia:
- UX gate: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34409396904 — **SUCCESS**.
- Deploy: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34409396917 — **SUCCESS**.

## Incidente de identidad detectado 2026-09-09
El primer intento del menú acotado tenía un error de modelo: la cuenta del administrador estaba registrada con `reporters.club_id='CUDO'`, pero el fixture y la tabla `teams` usan como identificador canónico `team_id='UNION-ORILLA'`.

Consecuencia: el menú intentaba buscar `teams.team_id='CUDO'`, no encontraba el club y no podía resolver Grupo A ni los partidos de Unión Orilla.

Corrección de raíz:
- migración `sports-bus/migrations/0006_canonical_reporter_club.sql` convierte reporteros históricos `CUDO → UNION-ORILLA` y evita que el alias vuelva a quedar persistido;
- el gate de despliegue exige `legacy_cudo_reporters=0`;
- exige al menos un reportero `UNION-ORILLA`;
- exige que `teams.UNION-ORILLA` exista en Grupo A;
- el menú `Mis partidos` usa el identificador canónico del fixture, no un alias de presentación.

Evidencia posterior: el diagnóstico remoto confirma `legacy_cudo_reporters=0`, un administrador verificado `UNION-ORILLA`, el equipo canónico en Grupo A y 5 partidos del club.

## Incidente Telegram 401 detectado y corregido 2026-09-09
Síntoma: `CUDODeportesBot` dejó de responder. El Worker seguía vivo, D1 seguía accesible, el token del bot estaba configurado y Telegram tenía el webhook correcto, pero existían 6 updates pendientes y Telegram reportaba `Wrong response from the webhook: 401 Unauthorized`.

Causa raíz: coexistían dos validaciones distintas del mismo `secret_token`:
- el Worker original valida el SHA-256 hexadecimal derivado de `TELEGRAM_WEBHOOK_SECRET`;
- el flujo nuevo por series comparaba el encabezado recibido directamente contra el secreto bruto.

Telegram enviaba correctamente el secreto derivado registrado, pero `series-entry.js` lo rechazaba antes de llegar a la validación original. Resultado: HTTP 401 para `/mispartidos`, callbacks y mensajes del flujo nuevo.

Corrección de raíz:
1. `sports-bus/cors-entry.js` reutiliza el mismo algoritmo de secreto seguro del Worker original;
2. la reconciliación del webhook registra siempre el secreto SHA-256 derivado, nunca el secreto bruto;
3. la petición entregada al handler de series se normaliza internamente sólo después de validar correctamente el secreto derivado;
4. el request original permanece intacto para el Worker original;
5. el deploy ejecuta una reconciliación idempotente del webhook y valida el runtime de Telegram;
6. existe `GET /health/telegram` para certificar configuración, Bot API, webhook y cola pendiente sin exponer secretos;
7. `.github/workflows/diagnose-sports-bus.yml` espera a que la cola pendiente llegue a cero y valida además identidad/alcance en D1.

Evidencia de recuperación:
- Deploy/auth fix: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34408360157 — **SUCCESS**.
- Diagnóstico posterior: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34408468127 — **SUCCESS**.
- La cola Telegram drenó `6 → 6 → 4 → 0`.
- `CUDODeportesBot`: Bot API OK, webhook configurado, token runtime presente, secret runtime presente.
- D1: `UNION-ORILLA`, Grupo A, administrador verificado activo, 5 partidos del club.

Regla persistente: no considerar Telegram operativo sólo porque `/health` del Worker responda. El gate real de transporte debe verificar Bot API + webhook + autenticación compatible + `pending_update_count=0`.

## Flujo materializado
`Telegram → Sports Event Bus → D1 → /api/v1/series-results → Partidos V8 → Tabla General / Tabla Senior`

Entrada principal del bot:
- `/mispartidos`
- `/resultados`

Flujo de botones:
`Mis partidos → Fecha → Mi partido → Serie → Marcador`

`/fecha2` queda sólo como compatibilidad temporal de la prueba anterior y redirige al nuevo menú acotado por cuenta; no es la UX objetivo.

## Persistencia y control
- Migración captura: `sports-bus/migrations/0005_series_reporting.sql`
- Migración identidad canónica: `sports-bus/migrations/0006_canonical_reporter_club.sql`
- Captura Telegram: `sports-bus/worker/series-entry.js`
- Rotulado local/visita: `sports-bus/worker/fixture-label.js`
- Gate UX local/visita: `.github/workflows/validate-sports-bus-ux.yml`
- Ingreso/compatibilidad de autenticación: `sports-bus/cors-entry.js`
- Diagnóstico: `.github/workflows/diagnose-sports-bus.yml`
- API verificada: `/api/v1/series-results`
- Reporte/auditoría: `series_reports`, `events`, `permission_audit`
- Sesión de entrada: `telegram_series_sessions`
- Resultado oficial por serie: `match_series_results` sólo cuando queda VERIFIED

## Verificación y conflicto por serie
- `SUPER_ADMIN`: puede dejar una serie VERIFIED directamente.
- `CLUB_ADMIN`: su reporte queda PROVISIONAL mientras no exista confirmación rival.
- Si ambos clubes informan el mismo marcador para la misma serie: VERIFIED.
- Si informan marcadores distintos: CONFLICT y no se publica hasta resolución administrativa.

## Consumo web
- `preview-v8/shared/championship.js` consume resultados VERIFIED desde Sports Event Bus con fallback al snapshot.
- `preview-v8/shared/standings.js` recalcula tablas desde la misma API VERIFIED con fallback seguro.
- La Tabla General sólo suma una jornada cuando existen Tercera + Segunda + Primera verificadas para el partido.
- Senior se recalcula independientemente cuando existe Senior verificada.

## Estado técnico vigente
- Backend series-aware: **CONFORME**
- API live VERIFIED: **CONFORME**
- Web conectada al API live: **MATERIALIZADA**
- Menú acotado por cuenta/club: **DESPLEGADO**
- Orden local/visita en botones de fecha: **MATERIALIZADO Y GATEADO**
- Identidad canónica reportero ↔ fixture: **CORREGIDA Y GATEADA**
- Transporte Telegram: **RECUPERADO Y DIAGNÓSTICO TÉCNICO CONFORME**
- Cola pendiente Telegram: **0**
- Datos ficticios insertados: **NO**
- Prueba humana del menú después de recuperación: **CONFORME**
- Prueba humana Fecha II end-to-end con marcador real: **PENDIENTE**
- RESULTADOS-01: **ABIERTO HASTA PRUEBA END-TO-END**

## Criterio de cierre
Se cierra RESULTADOS-01 sólo después de que el administrador de CUDO entre por `Mis partidos`, vea únicamente su fixture, seleccione Fecha II, ingrese al menos un resultado real por serie y éste se valide en D1/API/web. Para la Tabla General se deben verificar las tres series Tercera + Segunda + Primera; para Senior basta su serie independiente.
