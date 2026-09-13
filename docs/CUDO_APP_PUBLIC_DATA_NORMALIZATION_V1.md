# CUDO App · Normalización pública de datos v1

Estado: **ACTIVO EN QA**

Este documento describe una regla del pipeline de generación de CUDO App: los valores capturados y curados en Google Sheets no se copian ciegamente al JSON público. El adaptador debe convertirlos al tipo público esperado y eliminar referencias que no sean seguras para publicación.

## Motivo

El sync QA de 2026-09-13 expuso diferencias reales entre la planilla y el contrato público:

- `PLANTEL_CONTROL.CAPITAN` / `PUBLICO_EXPORT.capitan` usa el vocabulario humano `SI|NO`, mientras V8 exige un booleano JSON.
- campos públicos de medios contenían referencias privadas firmadas de Tally. Una URL privada con token/firma no puede formar parte de un JSON público.
- Galería exige `imagen_ref`; después de retirar una referencia privada, una entrada de galería sin imagen deja de cumplir su propio contrato.

## Regla de tipos

El adaptador `preview-v8/tools/sync_google_publico.mjs` declara tipos por módulo.

Para Plantel:

- `numero` -> entero/número público.
- `capitan`: `SI` -> `true`; `NO` -> `false`.
- cualquier otro valor no reconocido para `capitan` hace fallar el sync; no se inventa un valor por defecto.

El validador `preview-v8/tools/validate_data.py` mantiene la regla de que `capitan`, si está presente, debe ser booleano JSON.

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
- La normalización es parte de la generación de la app, no una limpieza manual posterior.
