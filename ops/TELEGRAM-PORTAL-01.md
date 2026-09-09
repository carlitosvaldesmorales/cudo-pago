# TELEGRAM-PORTAL-01 — Estado operativo

Fecha: 2026-09-09
Rama de trabajo: `feature/telegram-portal-01`
Base de integración: `feature/sports-event-bus-v1`
PR: #5

## Objetivo
Evolucionar el Sports Event Bus existente hacia un portal Telegram multi-club sin crear otra infraestructura.

## Decisiones validadas
1. Telegram presenta dos puertas principales: `Público` y `Dirigentes`.
2. La marca visible del portal es neutral: `Fútbol Chépica`; CUDO continúa siendo un club y `cudo.cl` no se transforma ahora en portal multi-club.
3. Identidad técnica: `telegram_user_id` existente en `reporters`.
4. Asociación administrativa: `reporters.club_id + role + trust_level + active`.
5. Enrollment: un usuario solicita acceso desde Telegram; la solicitud queda `PENDING`; un `SUPER_ADMIN` aprueba o rechaza.
6. Al aprobar, el usuario queda `CLUB_ADMIN / VERIFIED` del club elegido.
7. `CLUB_ADMIN` sólo puede operar partidos en que participa su `club_id`.
8. Resultado ingresado por `CLUB_ADMIN / VERIFIED` para su partido queda `VERIFIED` directamente; no espera confirmación rival.
9. `SUPER_ADMIN` conserva capacidad global.
10. El flujo de usuario común `SUBMITTED → aprobación → VERIFIED` queda como siguiente bloque; no se declara implementado todavía.
11. No crear bot por club, Worker por club, D1 por club ni dominio nuevo en este hito.

## Materializado en rama
- `sports-bus/migrations/0007_telegram_access_requests.sql`
  - tabla `access_requests`;
  - estados PENDING / APPROVED / REJECTED / CANCELLED;
  - sólo una solicitud PENDING por Telegram user.
- `sports-bus/worker/portal-entry.js`
  - `/start` → Público / Dirigentes;
  - enrollment por club;
  - estado de solicitud;
  - bandeja SUPER_ADMIN;
  - aprobar/rechazar;
  - alta en `reporters`;
  - resultados VERIFIED registrados;
  - puente hacia `Mis partidos` existente.
- `sports-bus/worker/club-admin-series-entry.js`
  - intercepta marcador de sesión de un CLUB_ADMIN verificado;
  - valida scope del partido contra `club_id`;
  - registra `series_reports` VERIFIED;
  - publica en `match_series_results` VERIFIED;
  - deja eventos y `permission_audit`.
- `sports-bus/cors-entry.js`
  - enruta portal y política CLUB_ADMIN antes del flujo legado sin eliminar RESULTADOS-01.
- `.github/workflows/deploy-sports-bus.yml`
  - gate de resultados pasa de snapshot rígido (`==20`, `==5`) a mínimos (`>=20`, `>=5`);
  - valida existencia de `access_requests` e integridad de series.
- `.github/workflows/validate-telegram-portal.yml`
  - syntax check;
  - aplica toda la cadena de migraciones en SQLite limpio;
  - valida contratos de enrollment/RBAC;
  - valida gate de crecimiento.

## Evidencia
- Validate Telegram Portal 01 run `34414143349`: SUCCESS.
- PR #5 mergeable contra `feature/sports-event-bus-v1`.
- Rama está aislada; el workflow de deploy productivo sólo dispara sobre `feature/sports-event-bus-v1`.

## Primer gate humano después del deploy
Usar una cuenta Telegram que NO sea el SUPER_ADMIN actual:
1. abrir bot y `/start`;
2. comprobar botones `Público` y `Dirigentes`;
3. entrar a Dirigentes → Solicitar acceso;
4. seleccionar un club;
5. verificar que la solicitud quede PENDING;
6. desde SUPER_ADMIN abrir solicitudes y aprobar;
7. volver a la segunda cuenta y comprobar que entra como CLUB_ADMIN del club correcto;
8. comprobar que `Mis partidos` sólo muestra los partidos de ese club.

No ingresar resultados ficticios para probar publicación. La validación de resultado CLUB_ADMIN se realizará con un resultado real disponible o con una estrategia de prueba separada que no contamine D1 productivo.

## GAP siguiente
Implementar usuario común:
`Público → Informar resultado → SUBMITTED → pendiente para admin del club/global → APPROVED/REJECTED → VERIFIED`.
