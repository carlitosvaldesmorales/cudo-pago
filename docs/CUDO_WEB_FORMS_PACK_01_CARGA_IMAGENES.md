# CUDO-WEB-FORMS — PACK 01 / CARGA HUMANA DE IMÁGENES

Estado del pack: **ABIERTO — NO CONFORME**

Bloqueo restante: **P06 requiere un E2E humano real de Galería con 2 o más fotografías en un mismo envío.**

## Objetivo funcional
Una persona no técnica debe poder seleccionar imágenes desde teléfono/computador al administrar **Noticias**, **Plantel** o **Galería**, sin escribir URL, ID de Drive ni datos técnicos, manteniendo el flujo:

Formulario humano → Google Sheet → CONTROL → revisión/autorización → PUBLICO_EXPORT → normalizador → JSON/media → CUDO V8.

## Decisión de captura Pack 01
Para los tres dominios con imagen se usa Tally como interfaz humana. Google Forms queda como rollback anterior. La arquitectura aguas abajo no cambia.

Formularios Tally publicados:
- Noticias `Me4Eel` → `https://tally.so/r/Me4Eel`
- Plantel `Npj7DO` → `https://tally.so/r/Npj7DO`
- Galería `QKZ7MX` → `https://tally.so/r/QKZ7MX`

Los tres aceptan sólo JPG/JPEG/PNG/WEBP, máximo 10 MB por archivo. Galería tiene carga múltiple habilitada.

## Criterios P01–P15
- P01 ✅ no se pide URL/ID técnico.
- P02 ✅ cargas reales realizadas desde móvil.
- P03 ✅ automatizaciones y sincronizaciones posteriores conservaron respuestas/media.
- P04 ✅ imagen vinculada al registro correcto en Noticias, Plantel y Galería.
- P05 ✅ normalizador valida MIME y genera referencia local estable.
- P06 ⏳ **pendiente prueba real con 2+ fotos en un mismo envío de Galería.**
- P07 ✅ registros llegaron inicialmente PENDIENTE_REVISION / NO / INTERNO.
- P08 ✅ publicación protegida por autorización; Galería incorpora control de menores. La prueba usada declara que no aparecen menores.
- P09 ✅ tras habilitación QA controlada, PUBLICO_EXPORT contiene las referencias correctas.
- P10 ✅ sincronización genera JSON y persiste media en V8.
- P11 ✅ workflow de render E2E V8 terminó en verde.
- P12 ✅ reejecuciones posteriores no destruyeron respuestas ni archivos.
- P13 ✅ Playwright + axe-core + Lighthouse en verde sobre head actualizado.
- P14 ✅ existen E2E reales con imagen en los tres dominios.
- P15 ✅ gate técnico objetivo reproducible ejecutado; esto no se presenta como sustituto de una evaluación subjetiva independiente de usabilidad.

## Gate A — Seguridad del provisionador — CONFORME
Evidencia:
- commits `e6f5efe978a0e35ead25e2295bc7fe9eb71cabf0`, `2c77cdf475ee88999bdb4d97376016fb2e1a97b1`, `101b8965720055a254c905a07d2390754751ae1c`.
- run `34002839964`, job `101404680638`: SUCCESS.
- salida `PACK01_GATE_A_STATIC: PASS`.

## Gate B — Captura humana — CONFORME para carga individual
### Noticias
- submission Tally `o9xLXXN`.
- imagen JPEG real, 203446 bytes.
- fila recibida por `TALLY_NOTICIAS` sin URL/ID solicitado al usuario.

### Plantel
- submission `rDqMN4R`.
- Renato Padilla, dorsal 11, DELANTERO, PRIMERA.
- imagen PNG Tally, id de archivo `OKxL4M`.
- autorización declarada: `La fotografía está autorizada`.

### Galería
- submission `8NEloLo`.
- álbum humano `Refuerzos 2026`, categoría CLUB, fecha 2026-08-01.
- imagen PNG Tally, id `jX8LPJ`.
- respuesta declara `¿Aparecen menores? NO`.

La capacidad de carga múltiple existe en el formulario, pero todavía falta falsarla con un envío humano real de 2+ imágenes; por eso P06 mantiene el Pack abierto.

## Gate C — Datos — CONFORME para los E2E ejecutados
### Noticias
`TALLY_NOTICIAS → RAW_FORM_NOTICIAS → NOTICIAS → REVISION → PUBLICO_EXPORT`
ID `QA-NOT-20260906020659-001`.

### Plantel
`TALLY_PLANTEL → RAW_FORM_PLANTEL → PLANTEL_CONTROL → REVISION → PUBLICO_EXPORT`
ID `QA-PLA-20260906022200-001`.

### Galería
La integración Tally creó la pestaña de respuestas `Subir fotos a la galería del CUDO`; el adapter enlaza esa pestaña a `RAW_FORM_GALERIA`.
Flujo:
`respuesta Tally → RAW_FORM_GALERIA → CONTROL → REVISION → PUBLICO_EXPORT`
ID `QA-GAL-20260906022413-001`.

En los tres casos se verificó el estado inicial no público antes de la habilitación QA controlada.

## Gate D — Media / JSON / V8 — CONFORME para carga individual
Hallazgos corregidos durante falsación:
- una URL privada Tally no puede tratarse como Drive por un `?id=` genérico;
- `capitan=NO` de Plantel debía canonicalizarse a boolean `false`;
- `album_id` de Galería debía derivarse de lenguaje humano a slug estable;
- se corrigió una regresión transitoria en el spreadsheet ID de Equipos antes de cerrar el run verde.

Resultados materializados en V8:
- Noticias → `media/noticias/tally-yr8Dd6.jpg`.
- Plantel → `media/plantel/tally-OKxL4M.png`, `capitan:false`.
- Galería → `media/galeria/tally-jX8LPJ.png`, `album_id:refuerzos-2026`.

Evidencia automática:
- sync/render run `34007255955`, job `101416645153`: **SUCCESS**.
- incluidos en verde: validación de contrato público, adapter sin mock, Playwright y `Validar render E2E Google a V8`.

## Gate E — Verificación técnica objetiva — CONFORME
El gate open source se adaptó para reconocer el modelo híbrido vigente: 3 formularios Tally de captura con imagen + 3 Google Forms de captura sin imagen + mantenimiento + revisión.

Evidencia final:
- commit QA `c8de7e8964878cee7aeb5b5f1f05e311020b6b5c`.
- run `34007390749`, job `101417008768`: **SUCCESS**.
- Playwright/axe: `ok:true`, 7 páginas auditadas, 8 formularios humanos detectados, 3 Tally + 5 Google.
- Lighthouse admin:
  - performance: `0.93` (mínimo 0.75)
  - accessibility: `1.00` (mínimo 0.90)
  - best-practices: `0.96` (mínimo 0.90)
- los HTTP 401 de Google Forms desde runner quedan clasificados como warnings conocidos, no como falsos fallos funcionales.

## Hallazgo editorial
La noticia de prueba es válida técnicamente pero no contenido editorial listo para producción; el cuerpo repite la misma frase. Se conserva sólo como evidencia QA.

## Único cierre pendiente
Ejecutar un envío real desde móvil en **Galería** con al menos **2 fotografías** del mismo evento, sin menores si es posible. Después verificar:
1. Tally y Sheet reciben ambas referencias en el mismo registro;
2. RAW/CONTROL conservan la asociación;
3. tras aprobación QA, PUBLICO_EXPORT mantiene el registro;
4. normalizador genera dos ítems/media sin mezclar álbumes;
5. V8 renderiza ambas imágenes;
6. rerun de QA objetivo permanece en verde.

## Regla de salida
**No cambiar el Pack a CONFORME hasta demostrar P06 con el E2E múltiple real.**
