# Sports Event Bus v1

Bus deportivo desacoplado de CUDO. Su objetivo es recibir eventos desde canales como Telegram y exponerlos de forma estándar para consumidores como CUDO V8, vMix, overlays y futuras plataformas.

## Principios
- Una sola captura, múltiples consumidores.
- Fuente, evidencia y validación explícitas.
- CUDO es un consumidor, no el bus.
- Infraestructura inicial serverless y costo $0 dentro de los free tiers usados.

## Primer flujo de aceptación
Telegram -> Sports Event Bus -> endpoint JSON -> CUDO / vMix.

## Estructura inicial
- `contracts/`: esquemas de eventos.
- `telegram/`: adaptador de entrada Telegram.
- `worker/`: punto de entrada para Cloudflare Workers.
- `tests/`: pruebas de contrato.

## Estado
Base v1 en construcción. No desplegar a producción hasta cerrar pruebas de contrato y webhook.
