# TELEGRAM-IDENTITY-ALIAS-01

Fecha: 2026-09-09
Estado: **READINESS + PRECHECK PRODUCCIÓN PASS / BLOQUEADO EN FRAGMENT: disponibilidad + costo + asignación autenticada**

## Objetivo

Eliminar la exposición pública de `@CUDODeportesBot` sin crear un bot nuevo, sin cambiar token, sin perder chats y sin reconstruir RBAC ni asociaciones por `telegram_user_id`.

## Evidencia fabricante

1. Telegram documenta que los bots pueden recibir usernames collectible de Fragment, incluso sin sufijo `bot`.
2. Los usernames collectible activos resuelven al mismo peer/bot; el primero de los usernames activos es el principal visible.
3. `bots.reorderUsernames` permite ordenar los usernames activos del bot.
4. `toggleBotUsernameIsActive` permite activar/desactivar usernames de un bot editable.
5. Bot API 9.3 agregó específicamente la posibilidad de que un bot desactive su username principal si tiene otros usernames activos comprados en Fragment.
6. El Bot API HTTP no expone un método `setMyUsername`; la operación de usernames múltiples pertenece a la capa propietaria/MTProto/Fragment y requiere actuar como dueño del bot, no sólo con el bot token.

### Nota sobre documentación histórica

La página general de Fragment todavía contiene texto histórico que dice que un username básico no se puede desactivar. La documentación bot-específica más nueva (Bot API 9.3 y TDLib actual) sí permite desactivar el username editable/principal de un bot cuando existe otro username activo. Para bots se toma como autoridad la regla posterior y específica, y se exige E2E después del cambio.

## Evidencia comunidad

- Un maintainer/contributor de TDLib aclaró que los usernames activos apuntan al mismo usuario/peer y pueden usarse de forma intercambiable.
- Experiencias de usuarios reportan que un username adquirido en Fragment se agrega como username adicional y puede ordenarse; también existen reportes de caché/propagación al asignarlo.
- Existen reportes comunitarios de phishing que imita Fragment. Regla operacional: usar exclusivamente `https://fragment.com` iniciado manualmente, nunca enlaces enviados por terceros, bots o mini apps no verificadas.

La comunidad se usa como evidencia secundaria; no se usa para fijar precio ni disponibilidad.

## Patrón elegido

```text
BOT ACTUAL
bot_id = MISMO
bot_token = MISMO
chats = MISMOS
telegram_user_id de usuarios = MISMOS
        │
        ├── editable/basic: @CUDODeportesBot (hoy activo)
        └── collectible: @FutbolChepica (candidato, NO confirmado)
                         │
                         ├─ adquirir/asignar en Fragment
                         ├─ activar
                         ├─ ordenar primero
                         └─ desactivar @CUDODeportesBot
```

Esto NO es un reverse proxy. Telegram resuelve `@username` y `t.me/...` dentro de su propia capa de identidad antes de que el webhook llegue al Worker. Cloudflare/DNS no puede reemplazar esa resolución.

## Orden de candidatos

Prioridad de marca, no disponibilidad confirmada:

1. `@FutbolChepica`
2. `@FutbolChepicaBot`
3. `@FutbolChepicaCL`

Los usernames collectible para bots pueden no usar sufijo `bot`, por lo que el candidato 1 es el de menor costo cognitivo si Fragment lo ofrece a un costo aceptable.

La ausencia de resultados en buscadores públicos NO se considera prueba de disponibilidad.

## Readiness del repositorio

### Links de invitación

El flujo de invitaciones no tiene `@CUDODeportesBot` fijado. Antes de construir `t.me/...`, consulta `getMe` y usa el username que Telegram devuelve. Por tanto las invitaciones nuevas seguirán el username principal que Telegram exponga después del cambio.

### Health

`/health/telegram` expone dinámicamente `bot_id`, `bot_username` y `bot_name`. No exige que el username sea `CUDODeportesBot`.

### Gate de identidad

Antes y después del alias deben mantenerse iguales:

- `bot_id`
- mismo token operativo (no exponerlo en logs ni documentación)
- webhook
- Worker
- D1
- roles y asociaciones `telegram_user_id`
- chats existentes

Debe cambiar únicamente la superficie de username principal/activo.

## PRECHECK PRODUCCIÓN — PASS

PR #15 fue validado por los tres gates existentes:

- `Validate Telegram QA Harness` run `34429964842` = SUCCESS.
- `Validate Public Result Submission` run `34429964985` = SUCCESS.
- `Validate Result Governance` run `34429964864` = SUCCESS.

PR #15 fue integrado en `feature/sports-event-bus-v1` con merge `f7f5ab8263f17e17bac240de251b6c36a0d2aa26`.

Deploy #54, run `34430004547`, terminó SUCCESS completo. Worker version: `af21194c-d5a6-47f7-bb8a-e3b04d15c4a9`.

Baseline de identidad capturado desde `/health/telegram`:

```text
bot_id = 8209002627
bot_username = CUDODeportesBot
bot_name = Fútbol Chépica
bot_api_ok = true
webhook_configured = true
native_menu_configured = true
default_commands_configured = true
pending_update_count = 0
```

Baseline funcional/deportivo durante el mismo deploy:

```text
matches = 25
byes = 5
teams = 11
VERIFIED series = 24
matches con resultados = 6
invalid_public_submission_status = 0
invalid_governance_status = 0
invalid_result_versions = 0
missing_current_version = 0
invalid_series = 0
```

Este `bot_id` es el identificador que debe permanecer igual después del cutover collectible.

## Plan de cutover

### PRECHECK

1. Capturar `bot_id`, username actual, nombre visible, webhook y estado del menú desde `/health/telegram`. **HECHO**.
2. Confirmar que producción mantiene fixture/resultados/roles. **HECHO**.
3. Ver disponibilidad y precio REAL del candidato en Fragment autenticado. **BLOQUEO ACTUAL**.
4. No comprar/asignar si el costo no cierra.

### CUTOVER HUMANO / FRAGMENT

1. Entrar manualmente a `fragment.com` con la cuenta dueña del bot y wallet compatible.
2. Adquirir o disponer del username collectible seleccionado.
3. Asignarlo al mismo bot `Fútbol Chépica`.
4. Activar el collectible.
5. Ordenarlo como primer username activo.
6. Desactivar `@CUDODeportesBot` usando la capacidad actual de Telegram para bots con username adicional activo.

### VALIDACIÓN POST

1. `/health/telegram`: `bot_id` debe seguir siendo `8209002627`, `ok=true`, nombre `Fútbol Chépica`.
2. `getMe`/health debe reflejar el username principal que Telegram exponga tras el cambio; se valida en runtime en vez de asumir su representación exacta.
3. `t.me/<nuevo>` debe abrir el chat existente del mismo bot.
4. Búsqueda global por el nuevo username debe encontrar el mismo bot.
5. `@CUDODeportesBot` debe quedar no activo/no visible públicamente; validar desde un cliente real.
6. Menú nativo y comandos por rol deben seguir funcionando.
7. Una invitación nueva debe generar `t.me/<username actual>?start=...` dinámicamente.
8. Fixture/resultados y RBAC no deben cambiar.

## Rollback

Si el alias produce un problema de UX/propagación:

1. Reactivar el username editable anterior mientras el dueño conserve control.
2. Ordenarlo nuevamente como principal.
3. Desactivar el collectible si corresponde.
4. Revalidar `/health/telegram`, webhook y menú.

No cambiar token ni bot_id durante rollback.

## Primer bloqueo real

No se puede cerrar desde CI ni con el Bot API del Worker:

- disponibilidad real del collectible candidato;
- precio/fee vigente para adquirirlo y/o habilitarlo para bot;
- conexión de cuenta Telegram propietaria + wallet;
- autorización de una eventual transacción TON;
- asignación del collectible al bot.

Fragment devuelve su información comercial/propietaria dentro del flujo autenticado y el precio no debe inferirse desde foros históricos. Ese es el punto de intervención humana.

## Regla de seguridad

- Abrir `fragment.com` escribiendo la dirección manualmente.
- No usar enlaces recibidos por DM.
- No entregar seed phrase, private key ni bot token.
- Ninguna captura de QA debe incluir secretos de wallet/token.
