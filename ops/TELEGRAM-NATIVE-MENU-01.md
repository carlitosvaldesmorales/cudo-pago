# TELEGRAM-NATIVE-MENU-01

Fecha: 2026-09-09
Estado: **MENÚ NATIVO DESPLEGADO + QA PASS + E2E VISUAL iOS PASS / BRANDING RUNTIME PASS + E2E VISUAL PENDIENTE**

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

`/ops/telegram/reconcile` reconcilia webhook, menú nativo y comandos públicos por defecto.

`/health/telegram` valida que el webhook, menú y comandos estén configurados. El deploy falla si estos contratos no se cumplen.

## QA y producción

- `Validate Telegram QA Harness` run `34425972389` = SUCCESS.
- PR #11: checks G1/G2/G3 + menú nativo = SUCCESS.
- PR #12 corrigió la carrera de propagación observada en deploy #50.
- Deploy #51, run `34426261859`, terminó SUCCESS.
- Producción conservó 25 partidos, 5 byes, 11 equipos, 24 series VERIFIED y 6 partidos con resultados.
- `telegram_menu_state_table = 1`.
- reconcile: `webhook=true`, `native_menu=true`, `default_commands=true`.
- `/health/telegram`: `ok=true`, `native_menu_configured=true`, `default_commands_configured=true`, `pending_update_count=0`.

## E2E visual iOS — PASS

Captura real recibida el 2026-09-09 desde Telegram iOS con la cuenta SUPER_ADMIN.

Se observó el menú nativo abierto y exactamente los comandos globales esperados:

- `/inicio` — Abrir administración global
- `/solicitudes` — Solicitudes de dirigentes
- `/dirigentes` — Administrar dirigentes
- `/pendientes` — Resultados por revisar
- `/correcciones` — Gobierno de resultados
- `/resultados` — Resultados registrados

No apareció `/mispartidos`, como corresponde al perfil global.

El panel visible detrás del menú también mostró la superficie ADMIN GLOBAL con solicitudes, resultados pendientes y dirigentes activos. Por tanto el gate humano del menú nativo queda cerrado.

## TELEGRAM-BRAND-NAME-01

La captura del E2E anterior detectó que la cabecera seguía mostrando **CUDO Bot** mientras la superficie funcional ya se presenta como **Fútbol Chépica**.

Contrato:

- nombre visible objetivo: `Fútbol Chépica`;
- conservar por ahora el username técnico `@CUDODeportesBot`;
- configurar el nombre mediante Bot API `setMyName` desde reconcile;
- comprobarlo mediante `getMyName` en `/health/telegram`;
- gate de deploy: `bot_name_configured=true` y `bot_name='Fútbol Chépica'`;
- no modificar datos deportivos, roles ni permisos.

### Implementación y QA

- PR #13 implementó `setMyName`, `getMyName`, health y gates de QA/deploy.
- PR #13 fue integrado con merge `d649f6c52ba6b8449039be1f35188ce400f5af0c`.
- Los checks de Telegram, aporte público y gobierno de resultados terminaron SUCCESS antes del merge.
- Deploy #52 demostró que Telegram aceptó el cambio (`bot_name=true`), pero el health inmediato alcanzó temporalmente el contrato anterior por propagación del Worker.
- PR #14 agregó espera explícita hasta observar el contrato nuevo de health, sin modificar código funcional ni datos.
- PR #14 fue integrado con merge `62701b86d639d1f182ba6545d26df4427988a3aa`.

### Producción — RUNTIME PASS

Deploy #53, run `34427165020`, terminó **SUCCESS** completo.

Evidencia del run:

- Worker desplegado: versión `078935c7-9ce2-4a84-a986-58052ab13585`.
- Reconcile: `webhook=true`, `native_menu=true`, `default_commands=true`, `bot_name=true`.
- `/health/telegram`: `ok=true`.
- `bot_username='CUDODeportesBot'` se conserva como identificador técnico.
- `bot_name='Fútbol Chépica'`.
- `bot_name_configured=true`.
- `webhook_configured=true`.
- `native_menu_configured=true`.
- `default_commands_configured=true`.
- `pending_update_count=0`.
- Producción conserva 25 partidos, 5 byes, 11 equipos, 24 series VERIFIED y 6 partidos con resultados.
- `invalid_public_submission_status=0`, `invalid_governance_status=0`, `invalid_result_versions=0`, `missing_current_version=0`, `invalid_series=0`.

### Gate humano residual

El runtime ya declara que Telegram tiene como nombre visible **Fútbol Chépica**. El único punto pendiente es comprobar cómo lo renderiza el cliente Telegram iOS real.

Prueba segura:

1. volver a la lista de chats o cerrar/reabrir el chat del bot;
2. comprobar la cabecera;
3. debe decir `Fútbol Chépica` en lugar de `CUDO Bot`;
4. enviar una captura para cerrar el E2E visual de branding.

No requiere modificar resultados, solicitudes ni dirigentes.
