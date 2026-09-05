# CUDO V8 · Pipeline de datos PROD

Ambiente: producción de datos Google.
Rama: `prod-v8-google-data`.

## Flujo

Google Form PROD -> RAW_FORM_* -> CONTROL -> PUBLICO_EXPORT -> `preview-v8/data/*.json` -> CI -> promoción controlada a producción.

## Reglas

- Esta rama no usa fallback mock.
- Los formularios solo capturan. Nunca publican directamente.
- `CONTROL` es la capa editorial/curada.
- `PUBLICO_EXPORT` contiene exclusivamente el contrato público.
- Los JSON públicos son: `noticias.json`, `equipos.json`, `plantel.json`, `partidos.json`, `tabla.json`, `galeria.json`.
- Los JSON deben pasar `preview-v8/tools/validate_data.py` y `.github/workflows/validate-data-env.yml`.
- Nunca exponer RUT, teléfonos, correos privados, direcciones, observaciones internas, autorizaciones ni nombres de origen privados.
- QA y PROD usan el mismo schema. El ambiente se define por la rama/adaptador, no por campos distintos.
- Ningún cambio de datos modifica HTML, CSS ni composición V8.

## Partidos · vertical de referencia

`RAW_FORM_PARTIDOS` recibe respuestas del formulario.
`CONTROL` toma automáticamente los campos capturados; `ESTADO_REGISTRO`, `PUBLICAR`, `PRIVACIDAD` y `FECHA_REVISION` son decisión editorial.
`PUBLICO_EXPORT` filtra solo `PUBLICADO + SI + PUBLICO`.
El destino es `preview-v8/data/partidos.json`.
