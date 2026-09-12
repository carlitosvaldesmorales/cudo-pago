# Telegram Root — contrato por audiencia v1

Fecha: 2026-09-12
Estado: IMPLEMENTED_PENDING_HUMAN_APPROVAL
Canal canónico: **@FutbolChepicaBot**

## Pantalla raíz aprobada

```text
⚽ FÚTBOL CHÉPICA

Portal del campeonato. Selecciona tu tipo de acceso:

[ 🌐 Público general ]
[ 🔐 Dirigentes ]
[ 🎥 Chépica Play ]
```

## Semántica de cada entrada

### 🌐 Público general

Callback: `tp:public`

Consume el Competition Hub público y sus capacidades canónicas de lectura/aporte.

### 🔐 Dirigentes

Callback: `tp:leaders`

Consume el portal de dirigentes existente. El acceso real sigue condicionado por rol, club, trust y estado.

### 🎥 Chépica Play

Callback: `mp:home`

Chépica Play es un **contexto operativo**, no una identidad sustitutiva.

La superficie operativa aprobada tiene exactamente:

1. 📝 **Ingresar resultados**
2. ⚽ **Consultar resultados**
3. 🏠 **Inicio**

Pueden acceder directamente a esa superficie:

- una identidad vinculada a Chépica Play;
- un `SUPER_ADMIN` o `PLATFORM_OPERATOR` verificado que ya posee autoridad de observación.

Para un administrador global, entrar a Chépica Play NO lo convierte en media partner. El registro conserva su `submitter_id`, rol y provenance reales, y agrega el contexto de entrada `CHEPICA_PLAY`. En las escrituras Telegram de ese contexto el canal auditable queda `telegram:chepica_play`.

## Gate de identidad no vinculada

Una identidad pública que selecciona **🎥 Chépica Play** no debe llegar a un callejón sin salida ni obtener permisos automáticamente. Debe ver:

```text
🔐 ACCESO CHÉPICA PLAY

Esta cuenta no está vinculada a Chépica Play.
Para entrar debes vincular esta identidad.

[ 📝 Solicitar autorización ]
[ 🌐 Público general ]
[ 🏠 Inicio ]
```

El mismo mensaje explica que una invitación individual existente puede abrirse desde esa cuenta Telegram.

### Solicitar autorización

Callback: `cp:access-request`

Crea una fila `PENDING` en `partner_access_requests`. No crea `actor_scope_grants`, no modifica `reporters.role`, no eleva trust y no habilita `cp:observe`.

Los administradores verificados con `MANAGE_ACCESS` reciben una notificación con `🔎 Revisar solicitud`.

Mientras esté pendiente, la persona ve:

- estado `PENDIENTE`;
- `🔎 Actualizar estado`;
- `❌ Cancelar solicitud`;
- acceso público e Inicio.

### Aprobar

Un administrador autorizado puede aprobar explícitamente. La aprobación:

- marca la solicitud `APPROVED`;
- crea/reactiva un grant `MEDIA_PARTNER` de scope `COMPETITION` para `ANFA-CHEPICA-2026`;
- asigna exactamente `READ_COMPETITION` + `OBSERVE_RESULT`;
- conserva la identidad/rol base del usuario;
- notifica a la persona;
- permite que su siguiente entrada a Chépica Play muestre la superficie operativa de dos capacidades.

### Rechazar

Marca la solicitud `REJECTED`, no crea grants y notifica a la persona. Su acceso público permanece disponible.

## Ingreso de resultados

El ingreso de resultados desde Chépica Play usa `cp:observe`, que activa el contexto y delega inmediatamente en la capacidad canónica `OBSERVE_RESULT`; no existe un segundo motor de resultados para Chépica Play.

## Invariantes de producto

- `ROOT_HAS_EXACTLY_THREE_AUDIENCES`
- `PUBLIC_LABEL_EQ_PUBLICO_GENERAL`
- `DIRIGENTES_REUSES_EXISTING_PORTAL`
- `CHEPICA_PLAY_HOME_EQ_ENTER_PLUS_READ_RESULTS`
- `CHEPICA_PLAY_REUSES_OBSERVE_RESULT`
- `RESTRICTED_AUDIENCE_MUST_HAVE_ACTIONABLE_ENROLLMENT_PATH`
- `REQUEST_NEQ_GRANT`
- `APPROVAL_CREATES_SCOPED_GRANT`
- `ACTOR_IDENTITY_NEQ_ENTRY_CONTEXT`
- `AUTHORIZATION_FOLLOWS_ACTOR`
- `UX_FOLLOWS_CONTEXT`
- `AUDIT_RECORDS_ACTOR_AND_CONTEXT`
- `CONTEXT_SWITCH_NEQ_IMPERSONATION`
- `ROOT_SELECTION_DOES_NOT_GRANT_AUTHORIZATION`
- `CANONICAL_BOT_EQ_FUTBOLCHEPICABOT`

## Gate humano

Después del despliegue deben validarse dos recorridos reales.

**Admin Global:** puede abrir **@FutbolChepicaBot → Chépica Play** y ver Ingresar resultados, Consultar resultados e Inicio sin convertirse en media partner.

**Cuenta pública no vinculada:** al abrir Chépica Play debe ver **📝 Solicitar autorización**. Al pulsarlo debe quedar `PENDIENTE` y el Admin Global debe recibir la revisión. Sólo después de aprobar debe aparecer la superficie operativa Chépica Play.

La validación final de escritura mantiene además:

- actor real;
- `entry_context = CHEPICA_PLAY`;
- `source_channel = telegram:chepica_play`;
- separación entre identidad base y grant de contexto.

Hasta estas pruebas humanas de runtime: `CHEPICA_PLAY_ACCESS.presentation_validation = PENDING_HUMAN_RUNTIME`.
