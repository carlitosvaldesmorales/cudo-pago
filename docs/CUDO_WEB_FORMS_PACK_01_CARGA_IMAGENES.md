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
5. Normalización de referencias Drive/archivo a media estable consumible por V8.
6. Validación E2E y gate independiente objetivo.

Fuera de alcance: socios, finanzas, estadio, infraestructura, Cudito y cualquier módulo nuevo.

## Contrato de no destrucción
El provisionador NO puede borrar ni recrear silenciosamente un formulario que contenga un `FILE_UPLOAD` o cualquier ítem no gestionado/protegido. Si detecta uno, debe:
- preservarlo;
- actualizar únicamente ítems gestionados compatibles; o
- fallar de forma segura antes de modificar el formulario si no puede demostrar preservación.

Nunca se considera válido `deleteItem()` masivo sobre un formulario con ítems protegidos.

## Criterios de aceptación obligatorios
- P01: usuario normal no ve ni ingresa URL/ID técnico para la imagen.
- P02: carga desde móvil es el camino normal.
- P03: Noticias, Plantel y Galería conservan su carga tras reejecutar el provisionador.
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
Criterio: no avanza si existe riesgo de borrado de `FILE_UPLOAD`.

Materializado:
- `SafeProvision.gs` detecta tipos protegidos y bloquea reconstrucción destructiva antes de cualquier `deleteItem()`.
- `Code.gs` reconoce `FILE_UPLOAD` como compatible en los slots humanos `IMAGEN_REF` / `FOTO_REF`, preserva ese ítem al actualizar y exige el guard global antes de una reconstrucción.
- `qa-pack01-static.mjs` es un gate reproducible que falla si desaparece cualquiera de esas protecciones.
- el workflow `CUDO QA Forms Auto` ejecuta ese gate antes de tocar Apps Script / Forms.

Evidencia:
- commit blindaje inicial: `e6f5efe978a0e35ead25e2295bc7fe9eb71cabf0`.
- commit blindaje global: `2c77cdf475ee88999bdb4d97376016fb2e1a97b1`.
- commit gate objetivo: `101b8965720055a254c905a07d2390754751ae1c`.
- GitHub Actions run `34002839964`, job `101404680638`: **SUCCESS**.
- salida objetiva: `PACK01_GATE_A_STATIC: PASS`.
- provisionamiento posterior: **11/11 pasos OK**, versión Apps Script `41`, seis formularios QA + ramificación Partidos + mantenimiento + revisión + auditoría, sin regresiones detectadas.

Conclusión Gate A: **cerrado y verificable**. El pack completo sigue abierto porque todavía no existen preguntas reales `FILE_UPLOAD` en Noticias, Plantel y Galería.

### Gate B — Captura humana — **ABIERTO**
Los tres dominios deben permitir seleccionar archivo sin dato técnico.

### Gate C — Datos — **ABIERTO**
RAW/CONTROL/revisión/PUBLICO_EXPORT conservan asociación y estados correctos.

### Gate D — Media/JSON/V8 — **ABIERTO**
Normalización, JSON y render real funcionan.

### Gate E — Verificación independiente — **ABIERTO**
Runner/QA objetivo reproducible en verde. Prueba humana móvil real se registra por separado cuando requiera dispositivo/autorización del usuario.

## Evidencia mínima de cierre
- commit(s) del blindaje;
- resultado de provisionamiento seguro;
- captura/respuesta de prueba de cada dominio o evidencia equivalente de Forms;
- filas RAW/CONTROL/PUBLICO_EXPORT del E2E;
- archivo normalizado y JSON resultante;
- render V8;
- ejecución QA verde;
- GAP humano explícito si queda una prueba que sólo Carlos puede autorizar/realizar.

## Regla de salida
**PACK 01 sólo cambia a CONFORME cuando P01–P15 están demostrados. Un GAP funcional mantiene el pack ABIERTO.**
