# ADN de confirmación gobernada — v1

Estado: CANÓNICO
Fecha: 2026-09-12

## Causa raíz

Una acción humana de confirmación no puede depender de efectos secundarios del canal para materializar su transición de negocio. En Telegram, `answerCallbackQuery`, editar el mensaje y notificar a revisores son efectos de canal; ninguno de ellos puede ser autoridad sobre si una solicitud quedó enviada.

La transición canónica es:

```text
CONFIRMACIÓN HUMANA
       ↓
VALIDAR BORRADOR / ACTOR
       ↓
PERSISTIR TRANSICIÓN DURABLE
       ↓
VERIFICAR ESTADO PERSISTIDO
       ↓
LIMPIAR BORRADOR
       ↓
EFECTOS SECUNDARIOS BEST-EFFORT
├── ACK Telegram
├── notificar revisores
└── renderizar estado al solicitante
```

## Invariantes

`HUMAN_CONFIRMATION_REQUIRES_IMMEDIATE_FEEDBACK`

El usuario nunca debe quedar frente al mismo botón sin saber si ocurrió algo. El adaptador intenta acusar recibo inmediatamente y siempre termina mostrando PENDIENTE, un estado idempotente existente o un error reintentable explícito.

`CHANNEL_ACK_NEQ_BUSINESS_TRANSITION`

`answerCallbackQuery` es una cortesía de UX. Si Telegram rechaza el ACK por timeout o query vencida, la transición durable debe continuar si el actor, el borrador y la intención son válidos.

`DURABLE_TRANSITION_PRECEDES_SIDE_EFFECTS`

La solicitud sólo existe cuando D1 confirma el estado durable. Notificaciones y presentación ocurren después.

`PERSISTENCE_FAILURE_PRESERVES_DRAFT`

Si no se puede materializar PENDING, el borrador REVIEW se conserva. El usuario recibe una ruta explícita de reintento y ningún permiso cambia.

`NOTIFICATION_FAILURE_NEQ_SUBMISSION_FAILURE`

Una falla al avisar a uno o más revisores no revierte una solicitud PENDING ya persistida. La cola administrativa sigue siendo la fuente de verdad.

`PRESENTATION_FAILURE_NEQ_SUBMISSION_FAILURE`

Una falla de edición/envío Telegram no puede deshacer una transición durable ya persistida.

`GOVERNED_TRANSITION_IS_IDEMPOTENT`

Repetir la misma confirmación no crea solicitudes duplicadas. Si el intake ya produjo un PENDING, el sistema converge a ese mismo estado y lo presenta nuevamente.

`FAILED_TRANSITION_NEVER_SILENT`

Un fallo pre-persistencia debe devolverse como estado reintentable visible y trazable; no como un no-op aparente.

`BEHAVIORAL_QA_REQUIRED_FOR_HUMAN_TRANSITIONS`

No basta con verificar strings o ramas de código. QA debe ejecutar la transición y probar al menos: ACK fallido, repetición idempotente y falla de persistencia.

## Alcance

Este contrato aplica a toda confirmación humana que materializa autoridad, solicitudes, publicaciones u otros estados gobernados. La primera implementación es el envío de solicitudes estructuradas de **Chépica Play** y **Dirigentes**.
