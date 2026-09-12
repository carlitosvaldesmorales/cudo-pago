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

La superficie aprobada tiene exactamente:

1. 📝 **Ingresar resultados**
2. ⚽ **Consultar resultados**
3. 🏠 **Inicio**

Pueden acceder a esa superficie:

- una identidad vinculada a Chépica Play;
- un `SUPER_ADMIN` o `PLATFORM_OPERATOR` verificado que ya posee autoridad de observación.

Para un administrador global, entrar a Chépica Play NO lo convierte en media partner. El registro conserva su `submitter_id`, rol y provenance reales, y agrega el contexto de entrada `CHEPICA_PLAY`. En las escrituras Telegram de ese contexto el canal auditable queda `telegram:chepica_play`.

Una identidad pública no vinculada y sin autoridad suficiente no obtiene acceso de escritura por seleccionar la audiencia.

El ingreso de resultados desde esta superficie usa `cp:observe`, que activa el contexto y delega inmediatamente en la capacidad canónica `OBSERVE_RESULT`; no existe un segundo motor de resultados para Chépica Play.

## Invariantes de producto

- `ROOT_HAS_EXACTLY_THREE_AUDIENCES`
- `PUBLIC_LABEL_EQ_PUBLICO_GENERAL`
- `DIRIGENTES_REUSES_EXISTING_PORTAL`
- `CHEPICA_PLAY_HOME_EQ_ENTER_PLUS_READ_RESULTS`
- `CHEPICA_PLAY_REUSES_OBSERVE_RESULT`
- `ACTOR_IDENTITY_NEQ_ENTRY_CONTEXT`
- `AUTHORIZATION_FOLLOWS_ACTOR`
- `UX_FOLLOWS_CONTEXT`
- `AUDIT_RECORDS_ACTOR_AND_CONTEXT`
- `CONTEXT_SWITCH_NEQ_IMPERSONATION`
- `ROOT_SELECTION_DOES_NOT_GRANT_AUTHORIZATION`
- `CANONICAL_BOT_EQ_FUTBOLCHEPICABOT`

## Gate humano

Después del despliegue, un Admin Global debe poder abrir **@FutbolChepicaBot → Chépica Play** y ver:

1. 📝 Ingresar resultados
2. ⚽ Consultar resultados
3. 🏠 Inicio

Al ingresar un resultado de prueba, el backend debe demostrar después que:

- el actor sigue siendo la cuenta real del Admin Global;
- `entry_context = CHEPICA_PLAY`;
- `source_channel = telegram:chepica_play`;
- no se creó ningún grant o membresía Chépica Play para el administrador.

Hasta esa prueba humana de runtime: `CHEPICA_PLAY_ADMIN_CONTEXT.presentation_validation = PENDING_HUMAN_RUNTIME`.
