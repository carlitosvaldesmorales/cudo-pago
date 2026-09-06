# CUDO-WEB-FORMS — PACK 01 / CARGA HUMANA DE IMÁGENES

Estado del pack: **ABIERTO — NO CONFORME**

## Objetivo funcional
Una persona no técnica debe poder seleccionar una imagen desde teléfono/computador al administrar **Noticias**, **Plantel** o **Galería**, sin escribir URL, ID de Drive ni datos técnicos. La imagen debe recorrer el flujo vigente:

Formulario humano → Google Sheet → CONTROL → revisión/autorización → PUBLICO_EXPORT → normalizador → JSON → CUDO V8.

## Alcance estricto
Incluye solamente:
1. Blindaje del provisionador para no destruir preguntas/ítems protegidos de carga de archivo.
2. Noticias: fotografía principal.
3. Plantel: fotografía del jugador.
4. Galería: una o más fotografías del mismo evento.
5. Normalización de referencias Drive/Tally a media estable consumible por V8.
6. Validación E2E y gate independiente objetivo.

Fuera de alcance: socios, finanzas, estadio, infraestructura, Cudito y cualquier módulo nuevo.

## Decisión de captura Pack 01
Google Forms se mantiene como implementación anterior/rollback. Para los dominios con imágenes se valida **Tally como interfaz humana de captura**, manteniendo intacta la arquitectura de datos CUDO aguas abajo.

Piloto materializado:
- Formulario Tally `Publicar una noticia del CUDO`.
- Form ID: `Me4Eel`.
- Captura directa de 1 imagen, máximo 10 MB, tipos JPG/JPEG/PNG/WEBP/HEIC.
- Integración con la planilla `CUDO_WEB_NOTICIAS_2026`, pestaña `TALLY_NOTICIAS`.
- `RAW_FORM_NOTICIAS` adapta automáticamente columnas Tally al contrato existente.

## Contrato de no destrucción
El provisionador Google anterior NO puede borrar ni recrear silenciosamente un formulario que contenga un `FILE_UPLOAD` o cualquier ítem no gestionado/protegido. Si detecta uno, debe preservarlo o fallar de forma segura antes de modificarlo.

## Criterios de aceptación obligatorios
- P01: usuario normal no ve ni ingresa URL/ID técnico para la imagen.
- P02: carga desde móvil es el camino normal.
- P03: Noticias, Plantel y Galería conservan su carga tras reejecutar automatizaciones.
- P04: archivo aceptado queda vinculado al registro correcto.
- P05: normalizador acepta únicamente MIME de imagen permitido y genera referencia estable.
- P06: Galería soporta múltiples fotos sin mezclar eventos/registros.
- P07: el registro nuevo queda PENDIENTE_REVISION; cargar una foto no publica automáticamente.
- P08: autorización de publicación es exigida donde corresponde; menores permanecen bloqueados mientras su autorización no esté verificada.
- P09: tras aprobación, CONTROL → PUBLICO_EXPORT contiene la referencia correcta.
- P10: sincronización genera JSON válido y copia/expone media consumible por V8.
- P11: V8 renderiza la imagen sin URL rota y con el comportamiento visual existente.
- P12: reejecutar automatizaciones no destruye respuestas, archivos ni preguntas protegidas.
- P13: pruebas técnicas/accesibilidad del alcance terminan en verde.
- P14: existe evidencia reproducible de al menos un E2E real con imagen.
- P15: el implementador no se autocertifica; el gate objetivo independiente debe ser ejecutado y su resultado registrado.

## Gates
### Gate A — Seguridad del provisionador — **CONFORME**
Materializado y verificado anteriormente.

Evidencia:
- commits `e6f5efe978a0e35ead25e2295bc7fe9eb71cabf0`, `2c77cdf475ee88999bdb4d97376016fb2e1a97b1`, `101b8965720055a254c905a07d2390754751ae1c`.
- GitHub Actions run `34002839964`, job `101404680638`: **SUCCESS**.
- `PACK01_GATE_A_STATIC: PASS`.

### Gate B — Captura humana — **PARCIALMENTE CONFORME**
Noticias quedó demostrado con una carga real desde móvil.

Evidencia Noticias:
- Tally submission `o9xLXXN` completada el `2026-09-06T02:06:59Z`.
- fotografía JPEG recibida: 203446 bytes.
- `TALLY_NOTICIAS` recibió la fila correspondiente automáticamente.
- no se solicitó URL, ID ni dato técnico al usuario.

Pendiente: reproducir el patrón en Plantel y Galería.

### Gate C — Datos — **PARCIALMENTE CONFORME**
Noticias recorrió correctamente la capa de datos:
- `TALLY_NOTICIAS` → `RAW_FORM_NOTICIAS`.
- ID generado: `QA-NOT-20260906020659-001`.
- estado inicial observado: `PENDIENTE_REVISION / NO / INTERNO / PENDIENTE`.
- antes de aprobación, `PUBLICO_EXPORT` permaneció vacío.
- tras habilitación QA controlada, `PUBLICO_EXPORT` recibió el mismo registro y su referencia de imagen.

La habilitación QA directa usada para este E2E no sustituye ni recertifica el motor de revisión, que ya había sido probado separadamente con publicación/corrección/retiro/reactivación.

Pendiente: Plantel y Galería.

### Gate D — Media/JSON/V8 — **PARCIALMENTE CONFORME**
Durante el E2E se detectó y corrigió un defecto real: el normalizador interpretaba cualquier `?id=` como Drive ID, lo que habría tratado el ID privado de Tally como archivo Google Drive.

Corrección materializada en rama `cudo-web-ux-01-v8`:
- commit `bfce55aff63c23e25ba37c721be37ad3665585d6`.
- `extractDriveIds()` quedó restringido a URLs Google Drive/Docs.
- se agregó reconocimiento explícito de `https://storage.tally.so/private/...`.
- la imagen Tally se descarga mientras el enlace firmado es válido y se persiste con nombre estable `tally-<fileId>.<ext>`.
- re-sincronizaciones reutilizan el archivo local persistido aunque el enlace firmado original ya no sea utilizable.
- MIME permitido se valida antes de persistir.

Evidencia automática posterior:
- commit del bot `d0dcbee19f360ec84ba798fae11af4d9e9d564b3`, mensaje `QA data/media sync: Google PUBLICO_EXPORT`.
- `preview-v8/data/noticias.json` contiene 1 ítem con `imagen_ref: media/noticias/tally-yr8Dd6.jpg`.
- archivo binario `preview-v8/media/noticias/tally-yr8Dd6.jpg` existe en la rama QA.

Pendiente: validación visual objetiva del render en V8 y repetir en Plantel/Galería.

### Gate E — Verificación independiente — **ABIERTO**
Debe ejecutarse el gate objetivo reproducible actualizado sobre el último head y registrarse su resultado. La implementación no se autocertifica.

## Hallazgo editorial de la prueba
El registro enviado por el usuario es válido técnicamente, pero **no se considera contenido editorial listo para producción**: el cuerpo repite cinco veces la misma frase. Se mantiene como evidencia QA y no como noticia definitiva del club.

## Evidencia mínima de cierre restante
- Plantel: E2E real con imagen.
- Galería: E2E real con una o más imágenes.
- render visual V8 de Noticias/Plantel/Galería.
- ejecución QA objetiva en verde sobre el head final.
- verificación de autorización/menores donde corresponda.

## Regla de salida
**PACK 01 sólo cambia a CONFORME cuando P01–P15 están demostrados. Un GAP funcional mantiene el pack ABIERTO.**
