# Audience Access Control Plane — v1

Estado: CANÓNICO
Fecha: 2026-09-12
Canal canónico: **@FutbolChepicaBot**

## Problema que corrige

Una audiencia restringida no puede terminar en una pantalla que sólo diga “no tienes acceso”. Detectar la falta de autorización no completa la experiencia. La misma política debe definir qué ocurre después: solicitar, esperar, aprobar/rechazar y materializar la autoridad correspondiente.

La regla raíz es:

```text
AUDIENCIA
   ↓
ACCESS POLICY CANÓNICA
   ↓
OPEN | AUTHORIZED | PENDING | REQUESTABLE
   ↓
CAPTURA ESPECÍFICA DEL ADAPTADOR
   ↓
REQUEST
   ↓
APROBACIÓN HUMANA
   ↓
AUTHORITY MATERIALIZER
   ├── ROLE          → Dirigentes / CLUB_ADMIN
   └── SCOPED_GRANT  → Chépica Play / MEDIA_PARTNER
```

La semántica de acceso es común. El almacenamiento y la forma de materializar la autoridad pueden ser distintos porque representan modelos de autorización distintos.

## Registro canónico

La fuente canónica es:

`sports-bus/worker/audience-access-policy.js`

El menú raíz de Telegram deriva directamente de ese registro. No existe una segunda lista manual de audiencias, callbacks o etiquetas.

### Público general

- acceso: `OPEN`
- autorización: `NONE`
- no requiere solicitud ni aprobación
- entrar nunca crea autoridad

### Dirigentes

- acceso: `RESTRICTED`
- autorización: `ROLE`
- autoridad objetivo: `CLUB_ADMIN`
- solicitud: `tp:req`
- estado: `tp:reqstatus`
- captura adicional: club representado
- persistencia del request: `access_requests`
- la autoridad sólo se materializa después de aprobación

### Chépica Play

- acceso: `RESTRICTED`
- autorización: `SCOPED_GRANT`
- autoridad objetivo: `MEDIA_PARTNER`
- solicitud: `cp:access-request`
- estado: `cp:access-status`
- cancelación: `cp:access-cancel`
- persistencia del request: `partner_access_requests`
- scope: competencia `ANFA-CHEPICA-2026`
- capacidades: `READ_COMPETITION` + `OBSERVE_RESULT`
- admite además invitación individual existente
- la autoridad sólo se materializa después de aprobación o claim válido

## Invariantes

`ROOT_AUDIENCE_REGISTRY_IS_CANONICAL`

La raíz visual, las etiquetas y callbacks de entrada se derivan del mismo registro de políticas de acceso.

`AUDIENCE_ACCESS_POLICY_PRECEDES_RENDERER`

Antes de renderizar una audiencia restringida debe existir una política explícita que defina su modelo de autorización y su ruta de resolución.

`RESTRICTED_AUDIENCE_MUST_HAVE_ACTIONABLE_ENROLLMENT_PATH`

Toda audiencia restringida debe tener una ruta accionable de solicitud y/o invitación. Una pantalla de denegación sin salida válida es un defecto de producto.

`NO_RESTRICTED_AUDIENCE_DEAD_END`

El validador falla si una audiencia `RESTRICTED` no es solicitables ni admite una vía de enrollment autorizada.

`AUDIENCE_ENTRY_NEVER_MATERIALIZES_AUTHORITY`

Seleccionar una audiencia nunca crea rol, grant, membresía ni elevación de permisos.

`REQUEST_NEQ_GRANT`

Crear una solicitud sólo materializa intención y estado `PENDING`; no crea autoridad.

`APPROVAL_PRECEDES_AUTHORITY`

La autoridad se materializa sólo después de una decisión de aprobación válida por un actor autorizado.

`SAME_STATE_MACHINE_DIFFERENT_AUTHORITY_MATERIALIZERS`

Las audiencias restringidas comparten la máquina semántica `REQUESTABLE → PENDING → APPROVED/REJECTED`, pero cada modelo de autorización conserva su materializador correcto. Dirigentes puede materializar un rol; Chépica Play un grant de scope.

`ACCESS_STORAGE_ADAPTER_NEQ_ACCESS_SEMANTICS`

`access_requests` y `partner_access_requests` son adaptadores de persistencia, no la definición de la política. La semántica vive en el control plane canónico.

`APPROVAL_SCOPE_MUST_MATCH_POLICY`

El materializador no puede conceder una autoridad más amplia que la declarada por la policy. Para Chépica Play, el contrato actual es únicamente `MEDIA_PARTNER` de competencia con `READ_COMPETITION` y `OBSERVE_RESULT`.

## Definition of Done

Una audiencia restringida sólo puede considerarse consumible cuando:

- existe en el registro canónico;
- tiene modelo de autorización explícito;
- entrar no concede autoridad;
- una identidad no autorizada recibe una acción resolutiva, no un callejón sin salida;
- la solicitud permanece sin privilegios;
- un aprobador autorizado puede revisar y decidir;
- la aprobación materializa exactamente la autoridad declarada;
- rechazo/cancelación no crean autoridad;
- QA determinista verifica policy + adaptadores;
- despliegue canónico pasa;
- una prueba humana real confirma el cruce entre identidad solicitante y aprobador en Telegram.
