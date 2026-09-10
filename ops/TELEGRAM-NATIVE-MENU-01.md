# TELEGRAM-NATIVE-MENU-01

Fecha: 2026-09-09
Estado: **DESPLEGADO + QA PASS / E2E VISUAL iOS PENDIENTE**

## Objetivo

Reducir el gasto cognitivo del canal Telegram: el usuario no debe memorizar comandos ni recorrer `/start` para encontrar funciones frecuentes.

Telegram mantiene el botón nativo **Menu** junto al campo de escritura. El Bot API permite configurarlo como lista de comandos y permite definir comandos con alcance por chat. Esta implementación usa ese patrón nativo; no introduce todavía una Mini App.

## Decisión

- Bot menu button: `commands`.
- Comandos por chat según rol real en D1.
- La autorización sigue viviendo en RBAC; el menú sólo descubre funciones, no concede permisos.
- Un perfil de menú se recalcula desde `reporters`.
- Se sincroniza sólo cuando cambia `perfil + versión`, evitando llamadas a Telegram en cada mensaje.
- Si Telegram falla al sincronizar el menú, el flujo normal del bot continúa y se reintenta en la próxima interacción.

## Perfiles

### PUBLIC

- `/inicio` — Abrir Fútbol Chépica
- `/publico` — Partidos y resultados públicos
- `/dirigentes` — Acceso de dirigentes

### CLUB_ADMIN

- `/inicio`
- `/mispartidos`
- `/pendientes`
- `/resultados`
- `/correcciones`
- `/publico`

### SUPER_ADMIN

- `/inicio`
- `/solicitudes`
- `/dirigentes`
- `/pendientes`
- `/correcciones`
- `/resultados`

Los comandos directos llevan al usuario al contenido o panel correspondiente. `/dirigentes` y `/correcciones` siguen usando los handlers ya existentes.

## Cambio de rol

```text
REPORTER/PUBLIC
   ↓ aprobación
CLUB_ADMIN
   ↓ próxima interacción
menú CLUB_ADMIN

CLUB_ADMIN
   ↓ suspensión/revocación
PUBLIC
   ↓ próxima interacción
menú PUBLIC
```

La tabla `telegram_menu_state` sólo cachea qué menú ya fue sincronizado. No es fuente de permisos.

## Reconcile y health

`/ops/telegram/reconcile` reconcilia en conjunto:

1. webhook;
2. menú nativo por defecto (`commands`);
3. comandos públicos por defecto.

`/health/telegram` verifica además:

- `native_menu_configured=true`;
- `default_commands_configured=true`.

El deploy falla si estos contratos no se cumplen.

## QA

Harness: `qa/telegram/telegram-native-menu-harness.mjs`.

Prueba con Worker real + D1 SQLite efímero + transporte Telegram simulado:

- perfil PUBLIC;
- idempotencia de sincronización;
- cambio PUBLIC → CLUB_ADMIN;
- comandos directos de club;
- suspensión CLUB_ADMIN → menú PUBLIC;
- perfil SUPER_ADMIN;
- comando directo de solicitudes;
- reconcile de menú por defecto;
- contrato de health;
- regresión G1.

Evidencia previa al PR:

- `Validate Telegram QA Harness` run `34425972389` = SUCCESS.
- PR #11: checks G1/G2/G3 + menú nativo = SUCCESS.

## Evidencia de producción

PR #11 fue integrado en `feature/sports-event-bus-v1`.

El primer deploy del menú, run `34426083821` (#50), alcanzó a:

- aplicar `0010_telegram_native_menu.sql` en D1;
- validar la nueva tabla `telegram_menu_state`;
- conservar 25 partidos, 5 byes, 11 clubes, 24 series VERIFIED y 6 partidos con resultados;
- desplegar el Worker versión `a6d51384-d023-4e7b-a124-47eab6460d63`.

Ese run falló después del deploy porque el primer request de reconcile recibió temporalmente el contrato del Worker anterior. No fue un fallo de Telegram ni de datos: era una carrera de propagación del runtime.

PR #12 corrigió el gate para reintentar hasta observar explícitamente el contrato nuevo. El deploy siguiente, run `34426261859` (#51), terminó **SUCCESS** completo.

Evidencia del run #51:

- D1: `0010_telegram_native_menu.sql` ya aplicado; no había migraciones pendientes.
- `telegram_menu_state_table = 1`.
- 25 partidos, 5 byes, 11 equipos.
- 24 series `VERIFIED` en 6 partidos; no se modificaron datos deportivos.
- `invalid_public_submission_status = 0`.
- `invalid_governance_status = 0`.
- `invalid_result_versions = 0`.
- `missing_current_version = 0`.
- reconcile runtime: `webhook=true`, `native_menu=true`, `default_commands=true`.
- `/health/telegram`: `ok=true`, `native_menu_configured=true`, `default_commands_configured=true`, `pending_update_count=0`.
- comandos públicos por defecto observados: `inicio`, `publico`, `dirigentes`.
- Worker versión desplegada: `3cd81e43-50e5-4558-a75a-325f5c3f0ed1`.

## Gate humano residual

El único punto no falsable desde CI/runtime es cómo lo renderiza el cliente Telegram real en iOS y si el perfil por chat aparece correctamente al usuario real.

Prueba mínima segura:

1. abrir el chat con el bot en Telegram iOS;
2. enviar `/inicio` una vez para forzar la sincronización del perfil real del chat;
3. confirmar que junto al campo de escritura aparece `Menu`/`Menú`;
4. tocarlo;
5. con la cuenta SUPER_ADMIN comprobar que muestra: `/inicio`, `/solicitudes`, `/dirigentes`, `/pendientes`, `/correcciones`, `/resultados`;
6. comprobar que NO aparece `/mispartidos` en ese menú global;
7. tocar `/inicio` y comprobar que abre el panel global.

No requiere modificar resultados ni dirigentes.
