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
1. `reporters.club_id` identifica el club del usuario.
2. `teams.group_id` determina automáticamente el grupo del club.
3. El bot consulta sólo partidos donde ese `club_id` participa como local o visita.
4. El usuario ve un menú de sus fechas del fixture.
5. Al elegir una fecha ve únicamente el partido de su club correspondiente a esa fecha.
6. Recién dentro de ese partido elige Tercera, Segunda, Senior o Primera.

Ejemplo CUDO:
`Cuenta CUDO → Grupo A automático → Mis fechas → Fecha II → Unión Orilla vs San Juan → Serie → Marcador`

Un administrador/member de CUDO NO debe navegar ni visualizar partidos de otros clubes dentro del flujo normal `Mis partidos`.

Un `SUPER_ADMIN` que además tiene `club_id=CUDO` mantiene por defecto este mismo menú acotado a CUDO. Las funciones globales de administración, si se requieren, deben existir en un flujo administrativo separado y explícito; no se mezclan con `Mis partidos`.

## Flujo materializado
`Telegram → Sports Event Bus → D1 → /api/v1/series-results → Partidos V8 → Tabla General / Tabla Senior`

Entrada principal del bot:
- `/mispartidos`
- `/resultados`

Flujo de botones:
`Mis partidos → Fecha → Mi partido → Serie → Marcador`

`/fecha2` queda sólo como compatibilidad temporal de la prueba anterior y redirige al nuevo menú acotado por cuenta; no es la UX objetivo.

## Persistencia y control
- Migración: `sports-bus/migrations/0005_series_reporting.sql` en `feature/sports-event-bus-v1`
- Captura Telegram: `sports-bus/worker/series-entry.js`
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

## Evidencia previa a la prueba humana
Deploy Sports Event Bus run 33:
https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34406209533

Validaciones del run:
- migración D1 aplicada: SUCCESS
- tablas de captura/sesión: SUCCESS
- 25 partidos + 5 libres: SUCCESS
- 20 resultados por serie Fecha I: SUCCESS
- `/api/v1/series-results`: SUCCESS
- Worker desplegado: SUCCESS

## Estado
- Backend series-aware: **CONFORME**
- API live VERIFIED: **CONFORME**
- Web conectada al API live: **MATERIALIZADA**
- Menú acotado por cuenta/club: **IMPLEMENTADO EN FEATURE; PENDIENTE VALIDACIÓN HUMANA**
- Datos ficticios insertados: **NO**
- Prueba humana Fecha II: **PENDIENTE**
- RESULTADOS-01: **ABIERTO HASTA PRUEBA END-TO-END**

## Criterio de cierre
Se cierra RESULTADOS-01 sólo después de que el administrador de CUDO entre por `Mis partidos`, vea únicamente su fixture, seleccione Fecha II, ingrese al menos un resultado real por serie y éste se valide en D1/API/web. Para la Tabla General se deben verificar las tres series Tercera + Segunda + Primera; para Senior basta su serie independiente.
