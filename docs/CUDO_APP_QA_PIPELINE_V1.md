# CUDO App · Pipeline QA canónico v1

Estado: **ACTIVO EN QA**

## Autoridad

Existe una sola autoridad automática capaz de llevar CUDO V8 desde Google hasta el snapshot QA publicado en `main/qa-v8-google`:

`.github/workflows/sync-qa-google-data.yml`

Su recorrido es:

Google `PUBLICO_EXPORT` → normalización pública → contratos → validación V8 → render E2E → commit de datos QA si corresponde → snapshot `qa-v8-google` → `main`.

## Regla de un solo escritor

El workflow histórico `.github/workflows/publish-qa-google.yml` queda en modo **legacy read-only** y sólo puede ejecutarse manualmente como diagnóstico. No posee `contents: write`, no se activa por pushes a `qa-v8-google-data` y no puede publicar en `main`.

La regla está protegida por `preview-v8/tools/validate_qa_pipeline.py`. CI falla si reaparece un segundo escritor automático hacia `main`.

## Concurrencia

El pipeline canónico usa el grupo `cudo-v8-qa-pipeline` con `cancel-in-progress: false`, de forma que dos ejecuciones del mismo pipeline no escriben simultáneamente.

Los commits generados exclusivamente bajo `preview-v8/data/**` no vuelven a disparar el sync completo. Esto evita un bucle después de sincronizar Google.

## Movimiento legítimo de main

`main` puede avanzar por trabajo ajeno a CUDO QA entre el checkout y el push final. El publicador canónico vuelve a leer `origin/main`, rebasa el commit de snapshot y reintenta el push hasta tres veces.

- Si el cambio concurrente es independiente, la publicación continúa.
- Si existe un conflicto real sobre el mismo contenido, el pipeline falla y lo trata como bloqueo técnico; no fuerza ni sobrescribe `main`.

## Invariantes

- Un solo escritor automático para `main/qa-v8-google`.
- Nunca usar `--force` para publicar QA.
- Nunca publicar antes de que Google, contratos y render E2E estén en PASS.
- Los datos generados por Google se materializan primero en `qa-v8-google-data`.
- `QA_BUILD.json` registra rama, commit fuente, run y fecha de publicación.
- Un movimiento concurrente de `main` se reconcilia; un conflicto real detiene el pipeline.
