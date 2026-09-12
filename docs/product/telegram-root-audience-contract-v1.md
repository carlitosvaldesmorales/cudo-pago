# Telegram Root — contrato por audiencia v1

Fecha: 2026-09-12
Estado: IMPLEMENTED_PENDING_HUMAN_APPROVAL
Canal canónico: **@FutbolChepicaBot**

## Pantalla raíz aprobada conceptualmente

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

Consume el espacio de media partner existente. El botón no vincula una identidad ni concede capacidades.

Una identidad **vinculada** a Chépica Play debe ver exactamente las dos capacidades aprobadas para esa audiencia:

1. 📝 **Ingresar resultados**
2. ⚽ **Consultar resultados**

Una identidad **no vinculada** no puede registrar como Chépica Play. Debe ver un gate de acceso que explique las dos capacidades y, si además posee autoridad de administración de accesos, debe ofrecer la entrada a la administración de identidades/invitaciones. Nunca se debe presentar una vista "Chépica Play" parcialmente habilitada que parezca reducir el producto a una sola capacidad.

La lectura pública sigue disponible para cualquier persona, pero fuera de la identidad operativa Chépica Play.

## Invariantes de producto

- `ROOT_HAS_EXACTLY_THREE_AUDIENCES`
- `PUBLIC_LABEL_EQ_PUBLICO_GENERAL`
- `DIRIGENTES_REUSES_EXISTING_PORTAL`
- `CHEPICA_PLAY_REUSES_MEDIA_PARTNER_HOME`
- `CHEPICA_PLAY_LINKED_HOME_EQ_ENTER_PLUS_READ_RESULTS`
- `CHEPICA_PLAY_UNLINKED_IDENTITY_CANNOT_IMPERSONATE_PARTNER`
- `CHEPICA_PLAY_UNLINKED_GATE_MUST_EXPLAIN_TWO_CAPABILITIES`
- `ROOT_SELECTION_DOES_NOT_GRANT_AUTHORIZATION`
- `START_PORTAL_INICIO_MENU_HOME_SHARE_ROOT`
- `CANONICAL_BOT_EQ_FUTBOLCHEPICABOT`

## Gate humano

Después del despliegue, el usuario debe abrir el inicio real de **@FutbolChepicaBot** y confirmar que la pantalla muestra exactamente:

1. 🌐 Público general
2. 🔐 Dirigentes
3. 🎥 Chépica Play

Luego, una identidad real vinculada a Chépica Play debe confirmar que su home muestra exactamente:

1. 📝 Ingresar resultados
2. ⚽ Consultar resultados
3. 🏠 Inicio

Hasta esa validación: `ROOT_ENTRY.presentation_validation = PENDING_HUMAN_RUNTIME`.
