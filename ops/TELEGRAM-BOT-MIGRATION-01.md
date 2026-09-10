# TELEGRAM-BOT-MIGRATION-01

Fecha: 2026-09-10
Estado: **BLUE/GREEN DESPLEGADO / M1-M3 PASS / M4 SUPER_ADMIN PASS / PENDIENTE VISTA PÚBLICA + SEGUNDA CUENTA**

## Decisión

Migrar desde `@CUDODeportesBot` hacia un bot nuevo con marca Fútbol Chépica, sin pagar un username collectible y sin cortar el bot actual antes de validar el reemplazo.

La migración NO duplica el backend:

```text
BOT ACTUAL                     BOT DESTINO
@CUDODeportesBot               @FutbolChepicaBot
      │                               │
/webhook/telegram              /webhook/telegram-next
      └──────────────┬────────────────┘
                     ▼
             MISMO WORKER
                     │
                     ▼
                 MISMO D1
                     │
         reporters / RBAC / resultados
```

## Evidencia fabricante Telegram

- Un bot normal se crea con `@BotFather` usando `/newbot`.
- El username de un bot normal debe terminar en `bot`.
- El token generado por BotFather controla completamente al bot y debe tratarse como contraseña.
- Cada bot puede configurar su propio webhook HTTPS con `setWebhook` y un `secret_token`.
- Un bot nuevo no puede iniciar conversaciones con usuarios; cada usuario debe abrirlo o enviarle un mensaje al menos una vez.

## Patrón de migración

Se usa blue/green porque hoy el costo técnico es bajo y permite rollback inmediato:

1. Mantener bot actual operativo.
2. Crear bot destino.
3. Guardar su token como secreto `TELEGRAM_BOT_TOKEN_NEXT` en Cloudflare.
4. Pipeline detecta automáticamente el slot destino y configura:
   - webhook `/webhook/telegram-next`;
   - nombre visible `Fútbol Chépica`;
   - menú nativo;
   - comandos públicos.
5. Validar health del bot destino.
6. Comparar `bot_id` con el bot actual.
7. SUPER_ADMIN inicia chat con bot destino.
8. Validar que conserva el mismo rol porque RBAC se basa en `telegram_user_id`, compartiendo D1.
9. Probar navegación y una acción no destructiva.
10. Recién después anunciar/migrar usuarios y retirar el webhook del bot antiguo.

## Aislamiento crítico de menús

El menú nativo por chat se cacheaba sólo por `telegram_user_id`. En convivencia de dos bots eso podía producir un falso positivo de sincronización.

Se agregó `telegram_menu_state_next`, utilizado únicamente por el bot destino mediante un wrapper de D1:

```text
usuario 123
├── bot actual  → telegram_menu_state
└── bot destino → telegram_menu_state_next
```

Los permisos siguen viniendo de `reporters`; estas tablas sólo cachean presentación.

## Runtime

Entrada de producción durante la migración:

- `sports-bus/telegram-migration-entry.js`
- core existente: `sports-bus/cors-entry.js`

El wrapper intercepta sólo tres rutas del bot destino:

- `POST /webhook/telegram-next`
- `POST /ops/telegram-next/reconcile`
- `GET /health/telegram-next`

El slot destino usa:

- `TELEGRAM_BOT_TOKEN_NEXT` — secreto del nuevo bot.
- `TELEGRAM_WEBHOOK_SECRET` actual como raíz; el secreto de webhook destino se deriva internamente con namespace `:next` y SHA-256.

## Seguridad

- Token de BotFather no se guarda en Git ni se comparte por chat.
- Se carga como secreto de Cloudflare Worker.
- El bot actual permanece como rollback hasta cerrar E2E.
- `drop_pending_updates=false`.

## QA

La rama de migración agregó `qa/telegram/telegram-bot-migration-harness.mjs` y quedó integrada mediante PR #16.

El QA demuestra:

- tabla de menú destino independiente;
- webhook destino reutiliza el mismo core;
- respuestas del bot destino usan sólo su token;
- RBAC sigue en el mismo D1;
- menú destino idempotente;
- bot actual y destino tienen caché independiente;
- reconcile configura `/webhook/telegram-next`;
- health destino expone ID, username, nombre y estados;
- bot actual permanece intacto;
- sin token destino el slot queda dormido.

G1/G2/G3 y el QA de menú existente también permanecen PASS.

## Evidencia producción

### Deploy inicial con slot dormido

Deploy #55 aplicó `0011_telegram_next_menu_state.sql`, conservó 25 partidos, 5 byes, 11 equipos, 24 series VERIFIED y 6 partidos con resultados. El slot destino quedó dormido mientras faltaba `TELEGRAM_BOT_TOKEN_NEXT`.

### Activación del bot destino

Después de crear `@FutbolChepicaBot` y cargar `TELEGRAM_BOT_TOKEN_NEXT` en Cloudflare, se re-ejecutó el job de deploy #55.

Resultado: **SUCCESS completo**.

Bot actual:

- `bot_id = 8209002627`
- `bot_username = CUDODeportesBot`
- `bot_name = Fútbol Chépica`
- webhook actual = PASS
- menú/comandos = PASS

Bot destino:

- `bot_id = 8979834638`
- `bot_username = FutbolChepicaBot`
- `bot_name = Fútbol Chépica`
- `bot_username_shape_ok = true`
- webhook `/webhook/telegram-next` = PASS
- menú nativo = PASS
- comandos públicos `inicio`, `publico`, `dirigentes` = PASS
- `pending_update_count = 0`
- `last_error_date = null`
- `last_error_message = null`

Los bot IDs son distintos, como corresponde a una migración de identidad, y ambos operan contra el mismo Worker/D1.

### E2E visual iOS — SUPER_ADMIN

Captura humana del 2026-09-10 confirma en el bot nuevo:

- encabezado visible `Fútbol Chépica`;
- `/start` abre el portal del campeonato;
- `/inicio` reconoce inmediatamente la identidad existente como `ADMIN GLOBAL`;
- no solicita recrear rol ni volver a enrolarse;
- panel global muestra solicitudes, resultados por revisar y dirigentes activos;
- botones globales disponibles: Solicitudes, Resultados pendientes, Dirigentes, Correcciones y disputas, Resultados registrados y Vista pública;
- botón nativo `Menú` visible.

Esto valida que el mismo `telegram_user_id` recupera su RBAC desde el D1 compartido al entrar por el bot nuevo.

## Gates de cutover

### M1 — Readiness código

- [x] wrapper blue/green
- [x] estado de menú separado
- [x] health/reconcile destino
- [x] deploy opcional y no bloqueante sin token
- [x] CI completo PASS
- [x] deploy productivo con slot dormido PASS

### M2 — Identidad destino

- [x] Crear bot en `@BotFather`.
- [x] Username `@FutbolChepicaBot` creado.
- [x] Token guardado en Cloudflare como `TELEGRAM_BOT_TOKEN_NEXT`.

### M3 — Runtime destino

- [x] reconcile destino PASS
- [x] `/health/telegram-next` = PASS
- [x] bot_id destino distinto del bot actual
- [x] nombre visible = `Fútbol Chépica`
- [x] webhook = `/webhook/telegram-next`
- [x] menú/comandos = PASS

### M4 — E2E humano

- [x] SUPER_ADMIN inicia chat con `@FutbolChepicaBot`.
- [x] El sistema reconoce el mismo `telegram_user_id` y muestra rol SUPER_ADMIN.
- [x] Menú global correcto.
- [ ] Vista pública correcta.
- [ ] Segunda cuenta/dirigente migra al iniciar chat; no requiere recrear rol.

### M5 — Cutover

- [ ] Nuevo bot declarado oficial.
- [ ] Enlaces/QR/publicaciones apuntan al nuevo username.
- [ ] Ventana corta de convivencia.
- [ ] Bot antiguo comunica migración, sin aceptar nuevas altas si se decide congelarlo.
- [ ] Retirar webhook antiguo sólo después de validar adopción.
- [ ] Conservar rollback documentado hasta cierre.

## Bloqueo humano actual

La identidad SUPER_ADMIN ya pasó E2E visual en el bot destino.

Quedan dos comprobaciones humanas antes de cutover:

1. En `@FutbolChepicaBot`, abrir `Vista pública` o `/publico` y confirmar que la navegación pública responde correctamente.
2. Desde la segunda cuenta que ya es `CLUB_ADMIN` de Unión Orilla, abrir `@FutbolChepicaBot` y enviar `/inicio`; debe recuperar automáticamente el rol existente y mostrar el portal del club sin una nueva solicitud.

El bot actual `@CUDODeportesBot` sigue operativo como rollback y todavía no debe retirarse.
