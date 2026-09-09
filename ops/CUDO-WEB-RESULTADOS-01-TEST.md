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

## Flujo materializado
`Telegram → Sports Event Bus → D1 → /api/v1/series-results → Partidos V8 → Tabla General / Tabla Senior`

El bot expone para esta prueba el comando `/fecha2`. Luego presenta botones por serie:
- Tercera
- Segunda
- Senior
- Primera

Al elegir una serie solicita el marcador en orientación `LOCAL-VISITA` (Unión Orilla vs San Juan).

## Persistencia y control
- Migración: `sports-bus/migrations/0005_series_reporting.sql` en `feature/sports-event-bus-v1`
- Captura Telegram: `sports-bus/worker/series-entry.js`
- API verificada: `/api/v1/series-results`
- Reporte/auditoría: `series_reports`, `events`, `permission_audit`
- Sesión de entrada: `telegram_series_sessions`
- Resultado oficial por serie: `match_series_results` sólo cuando queda VERIFIED

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
- Datos ficticios insertados: **NO**
- Prueba humana Fecha II: **PENDIENTE**
- RESULTADOS-01: **ABIERTO HASTA PRUEBA END-TO-END**

## Criterio de cierre
Se cierra RESULTADOS-01 sólo después de que el administrador de CUDO ingrese al menos un resultado real de Fecha II por Telegram y se valide en D1/API/web. Para la Tabla General se deben verificar las tres series Tercera + Segunda + Primera; para Senior basta su serie independiente.
