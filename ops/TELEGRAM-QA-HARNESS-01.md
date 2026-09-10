# TELEGRAM-QA-HARNESS-01

Fecha: 2026-09-09
Estado: MATERIALIZADO EN BRANCH / PENDIENTE CI

## Objetivo

Reducir la dependencia de pruebas manuales en Telegram probando automáticamente el mismo Worker y las mismas reglas de D1/RBAC con updates y callbacks simulados.

## Qué prueba realmente

El harness importa `sports-bus/cors-entry.js`, por lo que recorre el routing real de producción. La persistencia usa SQLite en memoria mediante un adaptador con la interfaz D1 (`prepare/bind/first/all/run/batch`) y aplica todas las migraciones SQL reales del repositorio.

El transporte Telegram se intercepta en memoria: `sendMessage` y `answerCallbackQuery` son capturados y validados. El harness bloquea cualquier intento de red hacia un host distinto al endpoint Telegram QA simulado y usa un token ficticio que nunca debe salir a Internet.

## Casos automatizados

1. `/start` muestra FÚTBOL CHÉPICA y Público/Dirigentes.
2. Usuario sin privilegios ve el flujo de solicitud de acceso.
3. Solicitud de acceso crea un único `PENDING` aunque se repita el callback.
4. Un usuario no global no puede ejecutar callbacks de lifecycle.
5. `SUPER_ADMIN` ve, revisa y aprueba una solicitud.
6. El usuario queda `CLUB_ADMIN / VERIFIED / active=1 / club_id=UNION-ORILLA`.
7. `Mis partidos` contiene exactamente el alcance de partidos del club según D1.
8. Un resultado enviado por CLUB_ADMIN se publica `VERIFIED` en la base QA con `source_type=TELEGRAM_CLUB_ADMIN`.
9. Suspender elimina una sesión de marcador abierta.
10. Suspender dos veces no duplica auditoría.
11. Un suspendido no puede re-solicitar acceso ni usar callbacks viejos de resultados.
12. Reactivar restaura el mismo club/rol y es idempotente.
13. Revocar conserva la identidad pero la degrada a `REPORTER / PROVISIONAL / club_id=NULL`.
14. Revocar dos veces no duplica auditoría.
15. Un revocado puede volver a solicitar acceso, pero no reutilizar privilegios antiguos.
16. Las transiciones de lifecycle quedan en `permission_audit`.

## Datos de QA

El harness usa únicamente identidades sintéticas `9900001+` y una base SQLite en memoria. El marcador `2-1` utilizado durante la prueba existe sólo en esa base efímera; jamás toca D1 remoto.

## Lo que NO prueba

Este harness no puede certificar:

- que Telegram entregue realmente el webhook desde su infraestructura;
- que un cliente Telegram autenticado renderice exactamente los botones/textos;
- comportamiento visual en iOS/Android/Web;
- login, QR, MFA o sesiones reales de Telegram;
- latencia/errores propios de Telegram en producción.

Esos puntos forman el gate humano residual.

## Regla de uso desde este hito

Cambios posteriores en Telegram/RBAC/lifecycle deben ejecutar este harness antes de solicitar una prueba humana. La prueba manual se reserva para aquello que no puede falsarse en CI: entrega real, render visual y operación con identidad autenticada.

## Primer bloqueante esperado

Cuando el CI quede PASS e integrado, el primer bloqueante será un E2E real mínimo desde Telegram:

`SUPER_ADMIN → Dirigentes → suspender CLUB_ADMIN real/controlado → cuenta suspendida intenta entrar → reactivar → cuenta recupera acceso`.

Hasta esa evidencia, G1 queda `QA AUTOMATIZADO PASS / E2E HUMANO PENDIENTE`.
