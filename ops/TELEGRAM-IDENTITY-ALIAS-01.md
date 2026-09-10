# TELEGRAM-IDENTITY-ALIAS-01

Fecha: 2026-09-09
Estado: **READINESS + PRECHECK PRODUCCIÓN PASS / FRAGMENT NO ES CHECKER DE USERNAME BÁSICO / BLOQUEO ACTUAL: disponibilidad collectible real o alternativa de bot nuevo**

## Objetivo

Eliminar la exposición pública de `@CUDODeportesBot` con el menor costo y riesgo posible, sin asumir que Fragment sirve para comprobar si un username básico está libre.

## Evidencia fabricante

1. Telegram distingue usernames básicos/editables de usernames collectible de Fragment.
2. Los collectible pueden asignarse a bots, activarse y reordenarse; el primero activo se presenta como principal.
3. Bot API 9.3 permite a bots desactivar su username principal cuando tienen usernames adicionales activos comprados en Fragment.
4. `bots.reorderUsernames` y `bots.toggleUsername` operan sobre usernames Fragment asociados a un bot.
5. Telegram dispone de validadores separados para usernames básicos (`account.checkUsername`, `channels.checkUsername`; `bots.checkUsername` en el flujo de managed bots), con estados distintos como `USERNAME_OCCUPIED` y `USERNAME_PURCHASE_AVAILABLE`.
6. Por tanto, un resultado `Unavailable / Not for sale` en Fragment NO prueba que un username básico esté ocupado. Sólo demuestra que ese texto no está disponible como collectible comprable/listado en ese contexto de Fragment.
7. Los usernames básicos de bots normalmente deben terminar en `bot`; los collectible asignados a bots pueden no llevar ese sufijo.

## Falsación realizada por el usuario

El 2026-09-09 se probó en Fragment una cadena arbitraria (`Jsjsjs.hsjs`). Fragment devolvió `Unavailable / Unknown / Not for sale` y normalizó el punto a `_` en el resultado. Telegram no admite `.` en usernames básicos, sólo letras, números y `_`.

Conclusión: **la caja de búsqueda de Fragment no debe usarse como fuente de verdad para decidir si un username básico de Telegram está libre.**

La prueba anterior de `FutbolChepica` en Fragment se reclasifica así:

- `@FutbolChepica` como **collectible comprable en Fragment**: no ofrecido en esa consulta (`Unavailable / Not for sale`).
- `@FutbolChepica` como **username básico Telegram**: estado NO DETERMINADO por esa consulta.
- Como username básico de bot, además, no cumple el patrón normal de sufijo `bot`; sólo sería útil para el bot actual mediante collectible u otra excepción administrada por Telegram.

## Patrón collectible válido

```text
MISMO BOT
bot_id = MISMO
bot_token = MISMO
chats = MISMOS
usuarios = MISMOS
        │
        ├── username básico actual: @CUDODeportesBot
        └── collectible comprado/asignado: @FutbolChepica
                         │
                         ├─ activar
                         ├─ ordenar primero
                         └─ desactivar username principal anterior
```

Esto no es reverse proxy: Telegram resuelve `@username` y `t.me/...` dentro de su propia capa de identidad antes del webhook.

## Readiness del repositorio

- Las invitaciones no fijan `@CUDODeportesBot`; consultan `getMe` y generan `t.me/${username}` dinámicamente.
- `/health/telegram` expone `bot_id`, `bot_username` y `bot_name` de forma dinámica.
- El username actual no está usado como condición de autorización.

## PRECHECK PRODUCCIÓN — PASS

PR #15 pasó:

- `Validate Telegram QA Harness` run `34429964842` = SUCCESS.
- `Validate Public Result Submission` run `34429964985` = SUCCESS.
- `Validate Result Governance` run `34429964864` = SUCCESS.

Deploy #54, run `34430004547`, terminó SUCCESS. Worker version: `af21194c-d5a6-47f7-bb8a-e3b04d15c4a9`.

Baseline de identidad:

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

Baseline funcional/deportivo:

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

## Árbol de decisión corregido

### Ruta A — collectible en el mismo bot

Sólo procede si encontramos/adquirimos un collectible de marca aceptable a costo razonable. Mantiene `bot_id=8209002627`, token, chats y usuarios.

### Ruta B — username básico de un bot nuevo

Un candidato como `@FutbolChepicaBot` debe comprobarse con una fuente de verdad de Telegram para bots (BotFather o mecanismo equivalente autorizado), no con Fragment. Si está disponible, crear un bot nuevo es gratuito pero cambia `bot_id`, token y exige que usuarios inicien conversación con la nueva identidad.

### Ruta C — conservar username técnico actual

Mantener `@CUDODeportesBot` y usar nombre visible `Fútbol Chépica`. Costo cero y sin migración, pero conserva fricción de marca en el enlace público.

## Próximo bloqueo real

Para decidir entre A y B falta una comprobación autoritativa que esta automatización no puede hacer con el token del bot actual:

1. si existe un collectible de marca aceptable realmente comprable en Fragment y su costo;
2. o si `@FutbolChepicaBot` está disponible como username básico de un bot, validado por BotFather/Telegram.

No inferir disponibilidad desde buscadores, t.me, Fragment `Unavailable` ni foros.

## Regla de seguridad

- Abrir Fragment manualmente sólo desde `https://fragment.com`.
- No entregar seed phrase, private key ni bot token.
- No comprar ni crear recursos hasta cerrar la comparación de costo/riesgo.
