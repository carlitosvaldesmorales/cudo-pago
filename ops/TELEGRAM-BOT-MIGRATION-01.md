# TELEGRAM-BOT-MIGRATION-01

Fecha: 2026-09-10
Estado: **BLUE/GREEN MATERIALIZADO / BLOQUEADO EN CREACIÓN DEL BOT DESTINO + CARGA SEGURA DEL TOKEN**

## Decisión

Migrar desde `@CUDODeportesBot` hacia un bot nuevo con marca Fútbol Chépica, sin pagar un username collectible y sin cortar el bot actual antes de validar el reemplazo.

La migración NO duplica el backend:

```text
BOT ACTUAL                     BOT DESTINO
@CUDODeportesBot               @FutbolChepicaBot (objetivo, disponibilidad pendiente)
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
- El username de un bot normal debe tener 5–32 caracteres, usar letras latinas, números o `_`, y terminar en `bot`.
- El token generado por BotFather controla completamente al bot y debe tratarse como contraseña.
- Cada bot puede configurar su propio webhook HTTPS con `setWebhook` y un `secret_token`.
- Un bot nuevo no puede iniciar conversaciones con usuarios; cada usuario debe abrirlo o enviarle un mensaje al menos una vez.

## Patrón de migración

Se usa blue/green porque hoy el costo técnico es bajo y permite rollback inmediato:

1. Mantener bot actual operativo.
2. Crear bot destino.
3. Guardar su token como secreto `TELEGRAM_BOT_TOKEN_NEXT` en Cloudflare; nunca pegarlo en chat, GitHub ni archivos.
4. Desplegar/re-ejecutar pipeline.
5. Pipeline detecta automáticamente el slot destino, configura:
   - webhook `/webhook/telegram-next`;
   - nombre visible `Fútbol Chépica`;
   - Menu nativo;
   - comandos públicos.
6. Validar health del bot destino.
7. Usuario SUPER_ADMIN abre el bot nuevo con `/start` o `/inicio`.
8. Validar que conserva el mismo rol porque RBAC se basa en `telegram_user_id`, compartiendo D1.
9. Probar navegación y una acción no destructiva.
10. Recién después anunciar/migrar usuarios y retirar el webhook del bot antiguo.

## Aislamiento crítico de menús

El menú nativo por chat se cacheaba sólo por `telegram_user_id`. En una convivencia de dos bots eso podría producir un falso positivo de sincronización.

Se agrega `telegram_menu_state_next`, utilizado únicamente por el bot destino mediante un wrapper de D1. Así:

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

El wrapper sólo intercepta tres rutas del bot destino:

- `POST /webhook/telegram-next`
- `POST /ops/telegram-next/reconcile`
- `GET /health/telegram-next`

Todo lo demás continúa por el core existente sin cambios.

El slot destino usa:

- `TELEGRAM_BOT_TOKEN_NEXT` — secreto nuevo, obligatorio para activar el slot.
- `TELEGRAM_WEBHOOK_SECRET` actual como raíz; el secreto de webhook destino se deriva internamente con un namespace `:next` y luego SHA-256, por lo que no hay que gestionar un segundo secreto humano.

## Seguridad

- No pegar token de BotFather en ChatGPT.
- No guardar token en archivos, commits ni variables públicas.
- Guardarlo directamente como secreto de Cloudflare Worker con nombre `TELEGRAM_BOT_TOKEN_NEXT`.
- El bot actual permanece como rollback hasta cerrar E2E.
- `drop_pending_updates=false`; no se descartan updates silenciosamente durante reconcile.

## QA requerido antes de merge

`qa/telegram/telegram-bot-migration-harness.mjs` debe demostrar:

- tabla de menú destino independiente;
- webhook destino reutiliza la misma lógica core;
- respuestas del bot destino usan sólo su token;
- identidad/RBAC siguen en el mismo D1;
- menú destino idempotente;
- bot actual y bot destino mantienen cachés independientes;
- reconcile configura `/webhook/telegram-next`;
- health destino expone ID, username, nombre y estados;
- bot actual permanece intacto;
- sin token destino el slot queda dormido y no realiza llamadas de red.

Además G1/G2/G3 y el QA de menú existente deben seguir pasando.

## Gates de cutover

### M1 — Readiness código

- [x] wrapper blue/green
- [x] estado de menú separado
- [x] health/reconcile destino
- [x] deploy opcional y no bloqueante sin token
- [ ] CI completo PASS
- [ ] deploy productivo con slot dormido PASS

### M2 — Identidad destino

- [ ] Crear bot en `@BotFather`.
- [ ] Preferencia: `@FutbolChepicaBot` si BotFather confirma disponibilidad.
- [ ] Si no está disponible, elegir variante antes de crear; no improvisar una marca larga sin revisar.
- [ ] Guardar token en Cloudflare como `TELEGRAM_BOT_TOKEN_NEXT`.

### M3 — Runtime destino

- [ ] reconcile destino PASS
- [ ] `/health/telegram-next` = PASS
- [ ] bot_id destino distinto del bot actual
- [ ] nombre visible = `Fútbol Chépica`
- [ ] webhook = `/webhook/telegram-next`
- [ ] menú/comandos = PASS

### M4 — E2E humano

- [ ] SUPER_ADMIN inicia chat con bot destino.
- [ ] El sistema reconoce el mismo `telegram_user_id` y muestra rol SUPER_ADMIN.
- [ ] Menú global correcto.
- [ ] Vista pública correcta.
- [ ] Segunda cuenta/dirigente migra al iniciar chat; no requiere recrear rol.

### M5 — Cutover

- [ ] Nuevo bot declarado oficial.
- [ ] Enlaces/QR/publicaciones apuntan al nuevo username.
- [ ] Ventana corta de convivencia.
- [ ] Bot antiguo comunica migración, sin aceptar nuevas altas si se decide congelarlo.
- [ ] Retirar webhook antiguo sólo después de validar adopción.
- [ ] Conservar rollback documentado hasta cierre.

## Primer bloqueo humano

El código puede llegar hasta M1 sin intervención.

Para M2 hace falta una acción que sólo puede hacer el propietario en Telegram:

1. abrir `@BotFather`;
2. ejecutar `/newbot`;
3. nombre visible: `Fútbol Chépica`;
4. intentar username `FutbolChepicaBot`;
5. si BotFather lo acepta, crear el bot;
6. NO enviar el token por chat;
7. cargarlo directamente en Cloudflare Worker como secreto `TELEGRAM_BOT_TOKEN_NEXT`.

Hasta ese punto el bot actual sigue operativo y no se modifica ningún dato deportivo.
