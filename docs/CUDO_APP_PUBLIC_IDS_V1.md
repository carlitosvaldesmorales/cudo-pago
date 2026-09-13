# CUDO App · Identificadores públicos v1

Estado: **ACTIVO EN QA**

## Certificación QA

Certificado el 2026-09-13 por el pipeline canónico `CUDO V8 - sync QA Google data`, run **34774122168**.

El live sync tomó `PUBLICO_EXPORT.album_id = "Santa Elena vs CUDO"`, lo transformó a `santa-elena-vs-cudo`, mantuvo el nombre visible del álbum y completó contratos + E2E + publicación en `main` sin corrección manual de la Sheet.

`qa-v8-google-data/preview-v8/data/galeria.json` y `main/qa-v8-google/data/galeria.json` contienen cuatro items publicados bajo el mismo `album_id` canónico.

## Evidencia

El live sync de medios v2 materializó correctamente las imágenes actuales de Tally y generó cuatro items de Galería, pero el contrato había detenido una ejecución anterior porque `PUBLICO_EXPORT.album_id` contenía el valor humano `Santa Elena vs CUDO`, mientras el contrato público exige un identificador técnico estable con minúsculas, números y guiones.

El nombre visible del álbum no está en conflicto. El problema corresponde únicamente al identificador público.

## Regla

La captura humana puede entregar un nombre legible como identificador de álbum. Antes de validar/publicar, `preview-v8/tools/normalize_public_ids.mjs` convierte `album_id` a slug canónico:

- elimina espacios exteriores;
- elimina diacríticos;
- convierte a minúsculas;
- convierte separadores y caracteres no alfanuméricos en `-`;
- colapsa guiones consecutivos;
- elimina guiones al inicio/final;
- falla si no puede producir un identificador no vacío.

Ejemplo material del QA:

`Santa Elena vs CUDO` → `santa-elena-vs-cudo`

El campo visible `album` no se modifica.

## Posición en el pipeline

Google `PUBLICO_EXPORT`
→ normalización de tipos/medios
→ normalización de identificadores públicos
→ contratos
→ E2E
→ publicación.

La normalización es automática en la frontera pública; no obliga al operador humano a editar manualmente la planilla.

## Invariantes

- No cambiar el nombre visible del álbum.
- No inventar identificadores a partir de datos ausentes.
- No relajar el contrato para aceptar espacios o mayúsculas.
- El normalizador forma parte de la superficie CI y del pipeline canónico.
