# ADN de captura humana antes de una transición gobernada — v1

Estado: CANÓNICO
Fecha: 2026-09-12

## Causa raíz

Una intención humana no es todavía una solicitud válida. El error detectado en Chépica Play fue convertir el clic **Solicitar autorización** directamente en un registro `PENDING`, antes de capturar la información que un revisor necesita para decidir.

Ese defecto no pertenece sólo a Chépica Play. Es una clase de error aplicable a cualquier flujo humano que crea un registro gobernado: accesos, altas, correcciones, disputas, postulaciones u otras mutaciones que requieren información y confirmación.

## Máquina canónica

```text
INTENCIÓN
   ↓
BORRADOR
   ↓
CAPTURA DE DATOS REQUERIDOS
   ↓
VALIDACIÓN
   ↓
REVISIÓN DEL USUARIO
   ↓
CONFIRMACIÓN EXPLÍCITA
   ↓
SUBMISIÓN
   ↓
PENDING / estado gobernado
   ↓
DECISIÓN / PROCESAMIENTO
```

## Invariantes raíz

`INTENT_NEQ_SUBMISSION`

Pulsar un botón de intención no crea por sí solo un registro sometido a gobierno.

`DRAFT_NEQ_PENDING`

Un borrador incompleto no aparece en la cola de trabajo de un administrador y no puede ser aprobado.

`REQUIRED_HUMAN_CONTEXT_PRECEDES_SUBMISSION`

Los datos humanos necesarios para decidir deben capturarse antes de crear el estado `PENDING`.

`CONFIRMATION_PRECEDES_PENDING`

El usuario revisa y confirma el resumen antes de que la solicitud exista como pendiente.

`TECHNICAL_IDENTITY_NEQ_DECLARED_PROFILE`

La identidad técnica proviene de Telegram (`telegram_user_id`, username, nombre del perfil). Nombre declarado y club/institución representada son afirmaciones humanas separadas. Nunca reemplazan la identidad técnica ni conceden permisos.

`REVIEWER_CONTEXT_REQUIRED`

Una solicitud que exige decisión humana debe mostrar al revisor el contexto necesario para decidir. No basta con un ID técnico.

`DRAFT_NEVER_GRANTS_AUTHORITY`

Crear, editar o cancelar un borrador no materializa roles, grants ni capacidades.

`SUBMISSION_NEVER_GRANTS_AUTHORITY`

Enviar una solicitud sólo crea un estado gobernado `PENDING`. La autoridad aparece únicamente después de una decisión válida de aprobación.

`ONE_ACTIVE_CONVERSATIONAL_INTAKE_PER_ACTOR`

Para evitar respuestas ambiguas, una identidad mantiene un solo formulario conversacional activo por vez en Telegram.

`CHANNEL_NATIVE_INPUT`

Telegram usa sus primitivas nativas (`ForceReply`, botones inline, edición de mensajes) en vez de simular formularios web dentro del chat.

`STALE_INTERACTION_FAILS_CLOSED`

Botones pertenecientes a un borrador vencido o reemplazado no pueden actuar sobre otro formulario posterior.

## Contrato para audiencias restringidas

Toda policy `requestable=true` debe declarar:

- un contrato de intake estructurado;
- campos humanos requeridos;
- mecanismo de captura de entidad representada;
- confirmación previa a `PENDING`.

Actualmente:

```text
DIRIGENTES
├── Nombre declarado
└── Club → catálogo canónico de equipos

CHÉPICA PLAY
├── Nombre declarado
└── Club / institución → texto declarado
```

Ambas audiencias reutilizan la misma máquina. Sólo cambian los campos/adaptadores específicos.

## Compatibilidad

Las solicitudes Chépica Play `PENDING` creadas por el flujo antiguo de un solo clic carecen del contexto humano requerido. La migración `0027_structured_access_request_intake.sql` conserva su trazabilidad marcándolas `CANCELLED` con razón `superseded_by_structured_intake_v1`. No se convierten silenciosamente en solicitudes válidas.

Las solicitudes históricas de Dirigentes se preservan como evidencia previa. Toda nueva solicitud pasa por el intake estructurado.

## Definition of Done

Un flujo humano de solicitud sólo es consumible cuando:

- intención y submisión son estados distintos;
- el borrador no genera autoridad ni trabajo pendiente;
- los campos obligatorios son validados;
- existe pantalla de revisión;
- el usuario confirma explícitamente;
- el revisor recibe contexto humano + identidad técnica;
- QA falla si una policy restringida vuelve a omitir el intake;
- el runtime real valida la conversación en Telegram.
