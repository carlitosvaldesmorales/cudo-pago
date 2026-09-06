# CUDO-WEB-FORMS — PACK 01 / CARGA HUMANA DE IMÁGENES

Estado del pack: **CONFORME**

## Objetivo funcional
Una persona no técnica puede seleccionar imágenes desde teléfono/computador al administrar **Noticias**, **Plantel** o **Galería**, sin escribir URL, ID de Drive ni datos técnicos, manteniendo el flujo:

Formulario humano → Google Sheet → CONTROL → revisión/autorización → PUBLICO_EXPORT → normalizador → JSON/media → CUDO V8.

## Decisión de captura Pack 01
Para los tres dominios con imagen se usa Tally como interfaz humana. Google Forms queda como rollback anterior. La arquitectura aguas abajo no cambia.

Formularios Tally publicados:
- Noticias `Me4Eel`
- Plantel `Npj7DO`
- Galería `QKZ7MX`

Galería tiene carga múltiple habilitada.

## Criterios P01–P15
- P01 ✅ no se pide URL/ID técnico.
- P02 ✅ cargas reales realizadas desde móvil.
- P03 ✅ automatizaciones y sincronizaciones posteriores conservaron respuestas/media.
- P04 ✅ imagen vinculada al registro correcto en Noticias, Plantel y Galería.
- P05 ✅ normalizador valida MIME y genera referencia local estable.
- P06 ✅ Galería validada con **4 fotografías reales en un mismo envío**.
- P07 ✅ registros llegaron inicialmente PENDIENTE_REVISION / NO / INTERNO.
- P08 ✅ publicación protegida por autorización; Galería incorpora control de menores. La prueba multifoto declara que no aparecen menores.
- P09 ✅ tras habilitación QA controlada, PUBLICO_EXPORT contiene las referencias correctas.
- P10 ✅ sincronización genera JSON y persiste media en V8.
- P11 ✅ workflow de render E2E V8 terminó en verde.
- P12 ✅ reejecuciones posteriores no destruyeron respuestas ni archivos.
- P13 ✅ Playwright + axe-core + Lighthouse en verde sobre head actualizado.
- P14 ✅ existen E2E reales con imagen en los tres dominios, incluido multifoto.
- P15 ✅ gate técnico objetivo reproducible ejecutado; no se presenta como sustituto de una evaluación subjetiva independiente de usabilidad.

## Gate A — Seguridad del provisionador — CONFORME
Evidencia:
- commits `e6f5efe978a0e35ead25e2295bc7fe9eb71cabf0`, `2c77cdf475ee88999bdb4d97376016fb2e1a97b1`, `101b8965720055a254c905a07d2390754751ae1c`.
- run `34002839964`, job `101404680638`: SUCCESS.
- salida `PACK01_GATE_A_STATIC: PASS`.

## Gate B — Captura humana — CONFORME
### Noticias
- submission Tally `o9xLXXN`.
- imagen real recibida desde móvil.

### Plantel
- submission `rDqMN4R`.
- Renato Padilla, dorsal 11, DELANTERO, PRIMERA.
- imagen real y autorización declarada.

### Galería — multifoto
- submission `yX7a2XB`, completada `2026-09-06T03:00:52Z`.
- álbum: `Santa Elena vs CUDO`.
- 4 fotografías JPEG distintas recibidas en el mismo envío:
  - `jX8W26`
  - `6G6v5O`
  - `1zQv5O`
  - `0zqv50`
- respuesta declara `¿Aparecen menores? NO`.

## Gate C — Datos — CONFORME
Durante la prueba multifoto se detectó un defecto de integración que inicialmente se interpretó como fallo Tally→Sheets. La falsación posterior demostró la causa real:

- Tally **sí** había escrito correctamente el segundo envío en la pestaña `TALLY_GALERIA`.
- `RAW_FORM_GALERIA` seguía apuntando a una pestaña antigua llamada `Subir fotos a la galería del CUDO`.

Corrección ejecutada:
- las 13 fórmulas del adapter `RAW_FORM_GALERIA` fueron redirigidas de la pestaña antigua a `TALLY_GALERIA`.
- Google Sheets reportó `formulasChanged: 13`.
- el registro multifoto pasó a `RAW_FORM_GALERIA` y `CONTROL` con ID `QA-GAL-20260906030052-001`.
- estado inicial observado: `PENDIENTE_REVISION / NO / INTERNO`.
- para el E2E QA se aplicó una revisión controlada; `PUBLICO_EXPORT` recibió el mismo registro con las 4 referencias.

La causa raíz queda clasificada como **adapter apuntando a la pestaña equivocada**, no como pérdida de datos de Tally.

## Gate D — Media / JSON / V8 — CONFORME
El normalizador ya soportaba `multi:true` para Galería y separó las 4 referencias del mismo registro sin mezclar álbumes.

Resultado materializado en `preview-v8/data/galeria.json`:
- `QA-GAL-20260906030052-001-01` → `media/galeria/tally-jX8W26.jpg`
- `QA-GAL-20260906030052-001-02` → `media/galeria/tally-6G6v5O.jpg`
- `QA-GAL-20260906030052-001-03` → `media/galeria/tally-1zQv5O.jpg`
- `QA-GAL-20260906030052-001-04` → `media/galeria/tally-0zqv50.jpg`

Los 4 ítems conservan:
- `album_id: santa-elena-vs-cudo`
- `album: Santa Elena vs CUDO`
- `fecha: 2026-08-23`
- `categoria: CLUB`
- `titulo: Tarde deportiva`

Evidencia automática final de sync/render:
- commit disparador `b6ff78565a87993008d8426f7b6ea47d54e68d15`.
- run `34008200087`, job `101419168533`: **SUCCESS**.
- en verde: sincronización PUBLICO_EXPORT/media, contrato público, adapter QA sin mock y render E2E V8.

## Gate E — Verificación técnica objetiva — CONFORME
Evidencia previa del gate objetivo:
- commit `c8de7e8964878cee7aeb5b5f1f05e311020b6b5c`.
- run `34007390749`, job `101417008768`: SUCCESS.
- Playwright/axe: 7 páginas, 8 formularios humanos, 3 Tally + 5 Google.
- Lighthouse admin: performance `0.93`, accessibility `1.00`, best-practices `0.96`.

Evidencia posterior al cierre multifoto:
- run `34008200082`, job `101419168308`: **SUCCESS**.
- Functional mobile/WCAG gate: SUCCESS.
- Lighthouse independent audit: SUCCESS.

## Hallazgo editorial
Los registros usados para QA no se consideran contenido editorial definitivo de producción. Se conservan como evidencia técnica del Pack 01.

## Cierre
**PACK 01 = CONFORME.**

La carga humana de imágenes para Noticias, Plantel y Galería quedó demostrada E2E, incluyendo Galería multifoto, preservando revisión, autorización, media estable, JSON y render V8.
