# CUDO App · Normalización pública de datos v1

Estado: **ACTIVO EN QA**

Este documento describe una regla del pipeline de generación de CUDO App: los valores capturados y curados en Google Sheets no se copian ciegamente al JSON público. El adaptador debe convertirlos al tipo público esperado y eliminar referencias que no sean seguras para publicación.

## Motivo

El sync QA de 2026-09-13 expuso diferencias reales entre la planilla y el contrato público:

- `PLANTEL_CONTROL.CAPITAN` / `PUBLICO_EXPORT.capitan` usa el vocabulario humano `SI|NO`, mientras V8 exige un booleano JSON.
- campos públicos de medios contenían referencias privadas firmadas de Tally. Una URL privada con token/firma no puede formar parte de un JSON público.
- Galería exige `imagen_ref`; después de retirar una referencia privada, una entrada de galería sin imagen deja de cumplir su propio contrato.
- una corrección de Partidos vía `VLOOKUP` puede devolver fecha y hora como valores nativos de Sheets: fecha serial y hora como fracción de día. El contrato público exige `YYYY-MM-DD` y `HH:MM`.
- la captura humana puede escribir la identidad del club como `Cudo`, `cudo` o `CUDO`, pero el contrato del renderer declara `CUDO` como identidad canónica.

## Regla de tipos

El adaptador `preview-v8/tools/sync_google_publico.mjs` declara tipos por módulo.

Para Plantel:

- `numero` -> entero/número público.
- `capitan`: `SI` -> `true`; `NO` -> `false`.
- cualquier otro valor no reconocido para `capitan` hace fallar el sync; no se inventa un valor por defecto.

Para campos temporales públicos:

- `fecha` -> siempre `YYYY-MM-DD`.
- `hora` -> siempre `HH:MM` en 24 horas.
- el adaptador acepta el formato contractual ya normalizado, fecha humana `DD/MM/YYYY` o `DD-MM-YYYY`, y el serial numérico nativo de Google Sheets cuando el campo está declarado como fecha.
- para hora, acepta `HH:MM`, `HH:MM:SS` o la fracción numérica nativa de un día de Google Sheets.
- cualquier valor temporal no reconocible hace fallar el sync; no se adivina una fecha ni una hora.

El validador `preview-v8/tools/validate_data.py` mantiene el contrato final. En Partidos, `fecha` debe usar `YYYY-MM-DD` y `hora`, cuando existe, `HH:MM`.

## Regla de identidad canónica en Partidos

El contrato `preview-v8/contracts/partidos-v1.json` define `renderer.cudo_identity = "CUDO"`.

En los campos `local` y `visita` del módulo Partidos:

- la comparación de la identidad propia es insensible a mayúsculas/minúsculas y elimina espacios exteriores;
- si el valor representa a CUDO, la salida pública se reescribe exactamente como `CUDO`;
- los nombres de rivales no se renombrarán ni se corregirán por inferencia;
- la identidad canónica se obtiene del contrato, no de una cadena duplicada en el test E2E.

Esto permite que la captura humana siga siendo tolerante sin trasladar variantes de escritura al JSON público ni al renderer.

## Regla de referencias públicas

Campos de medios públicos (`foto_ref`, `imagen_ref`) pueden contener ruta relativa o URL HTTPS pública, pero no pueden publicar credenciales embebidas.

El adaptador elimina antes de generar JSON:

- referencias `storage.tally.so/private/...`;
- URLs con parámetros `accessToken`;
- URLs con parámetros `signature`.

El validador aplica la misma prohibición al JSON final. Así la seguridad no depende sólo del adaptador.

## Comportamiento mientras no exista media pública segura

La conducta depende del contrato del módulo:

- **Noticias:** `imagen_ref` es opcional. Si sólo existe una referencia privada/firmada, la noticia se mantiene y `imagen_ref` queda vacío.
- **Plantel:** `foto_ref` es opcional. Si sólo existe una referencia privada/firmada, el jugador se mantiene y `foto_ref` queda vacío.
- **Galería:** `imagen_ref` es obligatorio. Si la única referencia disponible no es publicable, la fila completa queda fuera de `galeria.json` hasta contar con una referencia pública segura. No se crea placeholder ni se relaja el contrato.

La solución definitiva de medios pertenece al cierre de imágenes de CUDO App: carga móvil -> almacenamiento público/controlado -> referencia pública estable -> V8.

## Invariantes

- Nunca convertir un dato inválido silenciosamente a otro significado.
- Nunca publicar tokens, firmas o URLs privadas como referencias de medios.
- Nunca fabricar una imagen o placeholder para hacer pasar el contrato.
- Un módulo con media opcional puede publicarse sin ella; un módulo cuya media es requerida debe excluir la fila hasta tener una referencia segura.
- Mantener contratos estrictos en CI; corregir el adaptador antes que relajar el schema.
- Normalizar tipos en la frontera pública, no obligar al operador humano a transformar seriales ni formatos internos de Sheets.
- Canonizar sólo identidades declaradas por contrato; no corregir nombres de terceros por inferencia.
- La normalización es parte de la generación de la app, no una limpieza manual posterior.
