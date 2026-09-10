# TELEGRAM-NATIVE-MENU-01

Fecha: 2026-09-09
Estado: MATERIALIZADO + QA PASS / DESPLIEGUE Y E2E VISUAL PENDIENTES

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

`/ops/telegram/reconcile` ahora reconcilia en conjunto:

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
- contrato de health.

También se mantiene el harness anterior de G1 como regresión obligatoria.

Evidencia previa al PR: `Validate Telegram QA Harness` run `34425934868` = SUCCESS.

## Gate humano residual

Después del despliegue, el único punto no falsable desde CI es cómo lo renderiza el cliente Telegram real del usuario.

Prueba mínima segura:

1. abrir el chat con el bot en Telegram iOS;
2. confirmar que junto al campo de escritura aparece `Menu`/`Menú`;
3. tocarlo;
4. con la cuenta SUPER_ADMIN comprobar que muestra los comandos globales y no los de CLUB_ADMIN/PUBLIC;
5. tocar `/inicio` y comprobar que abre el panel global.

No requiere modificar resultados ni dirigentes.
