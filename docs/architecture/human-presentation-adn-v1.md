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

## Invariantes

`HUMAN_OUTPUT_REQUIRES_PRESENTATION_MODEL`

Ningún adaptador humano debe presentar directamente filas de persistencia, DTO de API o estructuras internas de dominio.

`DATA_CORRECT_NEQ_CONSUMABLE_UX`

Dato correcto y runtime correcto no equivalen a experiencia terminada. Una capacidad humana sólo puede declararse `CONSUMABLE` cuando su Presentation Model y su renderer de canal han sido validados.

`ONE_SCREEN_ONE_PRIMARY_CONTEXT`

Una pantalla transaccional o informativa debe tener un contexto primario identificable. Si el usuario consulta una tabla, una pantalla no debe concatenar múltiples campeonatos y múltiples grupos sin una razón funcional aprobada.

`CHANNEL_RENDERER_NEQ_DOMAIN_POLICY`

El renderer de Telegram no conoce cómo se calculan los puntos, desempates o autoridad. Sólo presenta un Presentation Model ya resuelto.

`TELEGRAM_STRUCTURED_NEQ_PLAIN_TEXT`

Telegram no es una web, pero tampoco es texto plano. El renderer Telegram debe usar jerarquía, `parse_mode`, bloques monoespaciados cuando corresponda, navegación inline y edición del mensaje vivo cuando la API lo permita.

`TRANSACTIONAL_CHAT_SINGLE_LIVE_SURFACE_WHEN_SUPPORTED`

Cuando una interacción ocurre sobre un mensaje con botones inline, la navegación debe preferir `editMessageText`/`editMessageReplyMarkup` en vez de acumular mensajes nuevos.

## Contrato de tablas en Telegram

Para `STANDINGS-READ`:

- una vista = un campeonato + un grupo;
- Principal y Senior nunca se concatenan en la misma tabla visual;
- Grupo A y Grupo B se navegan, no se apilan;
- los empates se explican una vez al pie, no mediante símbolos repetidos en cada fila;
- la tabla usa formato monoespaciado dentro de HTML;
- la navegación mantiene contexto: campeonato, grupo, resultados y público;
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
