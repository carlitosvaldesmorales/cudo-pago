# ADN de entrada por audiencia — v1

Estado: CANÓNICO
Fecha: 2026-09-12
Canal producto: **@FutbolChepicaBot**

## Causa raíz

El menú raíz de Fútbol Chépica estaba modelado como una mezcla de funciones y accesos. Luego apareció un segundo desvío: se confundió **entrar a una audiencia** con **adoptar la identidad de esa audiencia**.

La entrada canónica es:

```text
FÚTBOL CHÉPICA
├── 🌐 Público general
├── 🔐 Dirigentes
└── 🎥 Chépica Play
```

La identidad del actor y el contexto de entrada son dimensiones distintas.

## Invariantes

`ROOT_MENU_REPRESENTS_AUDIENCES_NOT_CAPABILITIES`

El menú raíz representa contextos humanos de acceso. No lista módulos técnicos ni capacidades internas.

`AUDIENCE_CONTEXT_PRECEDES_CAPABILITY_SELECTION`

Primero se selecciona el contexto humano; después se presentan las capacidades pertinentes.

`AUDIENCE_ENTRY_NEQ_AUTHORIZATION`

Pulsar Público general, Dirigentes o Chépica Play no concede permisos. Cada capacidad sigue validando identidad, scope, rol, trust y autoridad según su policy canónica.

`ACTOR_IDENTITY_NEQ_ENTRY_CONTEXT`

La identidad real del actor nunca se reemplaza por la audiencia seleccionada. Un Admin Global puede entrar al contexto Chépica Play sin convertirse en una identidad Chépica Play.

`AUTHORIZATION_FOLLOWS_ACTOR`

La autorización se resuelve siempre desde el actor real. El contexto no eleva privilegios ni crea grants.

`UX_FOLLOWS_CONTEXT`

La superficie visual y la navegación siguen el contexto seleccionado. Un Admin Global que entra a Chépica Play puede probar exactamente la experiencia operativa Chépica Play si su rol real ya posee autoridad suficiente.

`AUDIT_RECORDS_ACTOR_AND_CONTEXT`

Toda escritura originada desde un contexto debe preservar por separado:

- actor real;
- rol/provenance real;
- contexto de entrada;
- canal técnico.

Para Telegram Chépica Play, una escritura de Admin Global conserva `submitter_id` del administrador y registra `entry_context=CHEPICA_PLAY` y `source_channel=telegram:chepica_play`.

`CONTEXT_SWITCH_NEQ_IMPERSONATION`

Cambiar de contexto de trabajo no es impersonación. Impersonar significaría reemplazar la identidad o provenance del actor; eso está prohibido.

`AUDIENCE_NEQ_CAPABILITY`

Público general, Dirigentes y Chépica Play no son implementaciones duplicadas de resultados, tablas o registro. Son consumidores/contextos de las mismas capacidades canónicas.

`ONE_CANONICAL_ROOT_ALL_ENTRY_PATHS`

Los accesos `/start`, `/portal`, `/inicio`, `/menu` y `tp:home` convergen en la misma representación raíz.

`CANONICAL_ROOT_TARGET_EQ_FUTBOLCHEPICABOT`

El producto nuevo se materializa en **@FutbolChepicaBot**. El bot CUDO anterior sólo reutiliza la semántica por compatibilidad.

## Reuso de capacidades

```text
                        FÚTBOL CHÉPICA
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
      Público general     Dirigentes      Chépica Play
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                    CAPACIDADES CANÓNICAS
                    RESULTS-READ
                    STANDINGS-READ
                    RESULTS-REGISTER
                    RESULTS-GOVERN
                    ...
                              │
                         POLICY / SCOPE
```

La entrada sólo resuelve contexto de navegación. La autoridad permanece en las capacidades y policies existentes.

## Chépica Play

El botón `🎥 Chépica Play` reutiliza `mp:home`.

No se crea un segundo flujo de negocio. La audiencia conserva exactamente dos funciones operativas:

1. consultar resultados;
2. ingresar resultados mediante la capacidad de observación existente.

Pueden usar esa superficie:

- una identidad real vinculada a Chépica Play;
- un `SUPER_ADMIN` o `PLATFORM_OPERATOR` verificado para operación, prueba y soporte.

En el segundo caso la experiencia visual es Chépica Play, pero la auditoría sigue atribuyendo la acción al administrador real. Una persona pública no vinculada y sin privilegio no obtiene autoridad por pulsar el botón.

## Definition of Done

La raíz/contexto sólo puede considerarse consumible cuando:

- aparecen exactamente las tres audiencias aprobadas;
- Chépica Play reutiliza el flujo existente;
- seleccionar una audiencia no crea permisos;
- Admin Global puede probar la UX Chépica Play sin convertirse en media partner;
- una escritura de prueba conserva actor real + contexto Chépica Play por separado;
- QA determinista pasa;
- despliegue canónico pasa;
- una validación humana confirma la presentación real en Telegram.
