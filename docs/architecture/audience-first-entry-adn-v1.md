# ADN de entrada por audiencia — v1

Estado: CANÓNICO
Fecha: 2026-09-12
Canal producto: **@FutbolChepicaBot**

## Causa raíz

El menú raíz de Fútbol Chépica estaba modelado como una mezcla de funciones y accesos. Eso obliga al usuario a comprender la estructura interna del sistema antes de resolver una pregunta más básica: **quién entra y en qué contexto humano**.

La entrada canónica se corrige a:

```text
FÚTBOL CHÉPICA
├── 🌐 Público general
├── 🔐 Dirigentes
└── 🎥 Chépica Play
```

## Invariantes

`ROOT_MENU_REPRESENTS_AUDIENCES_NOT_CAPABILITIES`

El menú raíz representa contextos humanos de acceso. No lista módulos técnicos ni capacidades internas.

`AUDIENCE_CONTEXT_PRECEDES_CAPABILITY_SELECTION`

Primero se selecciona el contexto humano; después se presentan las capacidades pertinentes.

`AUDIENCE_ENTRY_NEQ_AUTHORIZATION`

Pulsar Público general, Dirigentes o Chépica Play no concede permisos. Cada capacidad sigue validando identidad, membresía, scope, rol y autoridad según su policy canónica.

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

El botón `🎥 Chépica Play` reutiliza `mp:home`, propiedad de `media-partner-enrollment-entry.js`.

No se crea un segundo flujo de negocio. La organización conserva exactamente sus capacidades actuales:

1. consultar resultados;
2. registrar resultados como aporte identificado.

Una identidad no vinculada recibe la experiencia de no-vinculado existente; una identidad vinculada recibe sus capacidades existentes.

## Definition of Done

La raíz sólo puede considerarse consumible cuando:

- los cinco caminos de entrada convergen en el mismo modelo;
- aparecen exactamente las tres audiencias aprobadas;
- Chépica Play reutiliza el flujo existente;
- seleccionar una audiencia no cambia permisos;
- QA determinista pasa;
- despliegue canónico pasa;
- una validación humana confirma la presentación real en Telegram.
