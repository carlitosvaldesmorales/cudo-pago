# Canal Telegram canónico — Fútbol Chépica

Estado: CANÓNICO
Fecha: 2026-09-12

## Identidad de producto

El bot Telegram que representa el producto Fútbol Chépica es:

**@FutbolChepicaBot**

Nombre visible esperado: **Fútbol Chépica**.

## Regla de arquitectura

`BOT_SLOT_NEQ_CAPABILITY_SEMANTICS`

Los slots técnicos de Telegram no definen la lógica del negocio. El bot canónico y el bot legado reutilizan las mismas capacidades centrales del Worker. La diferencia es de adaptador/canal, no de semántica de resultados, permisos ni dominio.

```text
                       CAPACIDADES CANÓNICAS
 RESULTS-READ · RESULTS-REGISTER · gobierno · público · acceso
                              │
                   ┌──────────┴──────────┐
                   │                     │
          CANAL CANÓNICO          COMPATIBILIDAD LEGADA
       @FutbolChepicaBot          slot Telegram anterior
      /webhook/telegram-next       /webhook/telegram
                   │                     │
                   └──────────┬──────────┘
                              │
                         mismo dominio
```

## Invariantes

- `CANONICAL_TELEGRAM_BOT_EQ_FUTBOLCHEPICABOT`
- Todo nuevo deep-link, enrollment y documentación de operación debe apuntar a `@FutbolChepicaBot`.
- El token configurado en `TELEGRAM_BOT_TOKEN_NEXT` debe resolver exactamente al username `FutbolChepicaBot`; una coincidencia genérica con cualquier username terminado en `bot` no es suficiente.
- El endpoint canónico de salud es `/health/telegram-canonical`.
- `/health/telegram-next` se conserva únicamente por compatibilidad técnica durante la transición.
- El slot antiguo no se elimina automáticamente: permanece como compatibilidad hasta una decisión explícita de retiro.
- Ninguna capacidad nueva debe desarrollarse sólo para el bot legado.

## Por qué aún existe `next`

`next` es un nombre técnico heredado del proceso de migración. No representa el estado del producto. Mientras se preserve compatibilidad interna, debe interpretarse como:

`internal_slot=next` → `channel_role=CANONICAL` → `@FutbolChepicaBot`.

Esto evita que futuros cambios confundan “primary/next” con “bot correcto/equivocado”.
