# ADN de presentación humana — v1

Estado: CANÓNICO
Fecha: 2026-09-12

## Causa raíz

Una capacidad técnicamente correcta no es consumible sólo porque el dato llega al canal. El dominio, la proyección y la presentación son responsabilidades distintas.

El flujo canónico de cualquier salida humana es:

```text
INTENCIÓN HUMANA
      ↓
CAPACIDAD CANÓNICA
      ↓
DOMINIO / POLICY
      ↓
PROYECCIÓN / READ MODEL
      ↓
PRESENTATION MODEL
      ↓
CHANNEL RENDERER
      ↓
Telegram · Web · otros canales
```

Para una entrada raíz existe una decisión anterior a la selección de capacidad:

```text
PERSONA
  ↓
AUDIENCIA / CONTEXTO DE ACCESO
  ↓
CAPACIDADES DISPONIBLES
  ↓
POLICY / AUTORIZACIÓN
```

El contrato específico está en `docs/architecture/audience-first-entry-adn-v1.md`.

## Invariantes

`HUMAN_OUTPUT_REQUIRES_PRESENTATION_MODEL`

Ningún adaptador humano debe presentar directamente filas de persistencia, DTO de API o estructuras internas de dominio.

`DATA_CORRECT_NEQ_CONSUMABLE_UX`

Dato correcto y runtime correcto no equivalen a experiencia terminada. Una capacidad humana sólo puede declararse `CONSUMABLE` cuando su Presentation Model y su renderer de canal han sido validados.

`ONE_SCREEN_ONE_PRIMARY_CONTEXT`

Una pantalla debe tener un contexto primario identificable. El contexto primario se define por la intención humana, no por la granularidad interna del dato. En `STANDINGS-READ`, el contexto primario público es el **campeonato**; sus grupos son secciones naturales de esa misma vista y no requieren navegación separada.

`ROOT_MENU_REPRESENTS_AUDIENCES_NOT_CAPABILITIES`

La pantalla raíz no es un catálogo de módulos. Representa los contextos humanos estables de acceso y deriva después hacia capacidades canónicas.

`AUDIENCE_CONTEXT_PRECEDES_CAPABILITY_SELECTION`

En la raíz, primero se resuelve si la persona entra como Público general, Dirigentes o Chépica Play. Esa elección sólo organiza navegación; no concede permisos.

`AUDIENCE_ENTRY_NEQ_AUTHORIZATION`

La selección de audiencia nunca reemplaza RBAC, scopes, membresías ni policies de las capacidades.

`CHANNEL_RENDERER_NEQ_DOMAIN_POLICY`

El renderer de Telegram no conoce cómo se calculan los puntos, desempates o autoridad. Sólo presenta un Presentation Model ya resuelto.

`TELEGRAM_STRUCTURED_NEQ_PLAIN_TEXT`

Telegram no es una web, pero tampoco es texto plano. El renderer debe usar jerarquía, `parse_mode`, navegación inline y edición del mensaje vivo cuando la API lo permita. El formato no debe introducir artefactos de canal como desplazamiento horizontal innecesario.

`CHANNEL_FORMAT_MUST_FIT_TARGET_DEVICE`

La presentación debe respetar las limitaciones reales del canal y del dispositivo. En Telegram móvil, una tabla pública no puede depender de un bloque monoespaciado ancho que obligue al usuario a desplazarse horizontalmente o muestre indicadores de overflow.

`TRANSACTIONAL_CHAT_SINGLE_LIVE_SURFACE_WHEN_SUPPORTED`

Cuando una interacción ocurre sobre un mensaje con botones inline, la navegación debe preferir `editMessageText`/`editMessageReplyMarkup` en vez de acumular mensajes nuevos.

## Contrato raíz Telegram

La raíz canónica de **@FutbolChepicaBot** contiene exactamente:

- 🌐 Público general
- 🔐 Dirigentes
- 🎥 Chépica Play

`/start`, `/portal`, `/inicio`, `/menu` y `tp:home` deben converger a esta misma representación. Las tres entradas reutilizan flujos existentes; el root no implementa reglas deportivas ni de autorización.

## Contrato de tablas en Telegram

Para `STANDINGS-READ`:

- una vista = un campeonato;
- Principal y Senior nunca se mezclan en la misma pantalla;
- cada campeonato muestra Grupo A y Grupo B juntos;
- no existen botones públicos Grupo A / Grupo B;
- el único selector competitivo es Principal / Senior;
- los empates se explican una vez al pie;
- no se usa `<pre>` ni `<code>` para forzar columnas en la clasificación pública;
- no se requiere scroll horizontal;
- la navegación mantiene acceso a Resultados y Público;
- el dominio sigue siendo la única autoridad de puntos y desempates.

## Definition of Done humano

```text
Regla / policy             ✓
Proyección / read model    ✓
Presentation Model         ✓
Channel Renderer           ✓
Navegación                 ✓
QA determinista            ✓
Validación humana visual   ✓
────────────────────────────
CONSUMABLE                 ✓
```

Si falta la validación humana visual, el módulo puede estar técnicamente desplegado y QA-certified, pero no debe marcarse `CONSUMABLE`.
