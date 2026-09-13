# CUDO App · Pipeline de medios v2

Estado: **CANDIDATO QA**

## Evidencia recuperada

CUDO ya había materializado medios de Tally en el Pack 01 de V8. La rama histórica `cudo-review-media-01` contiene imágenes bajo `preview-v8/media/{noticias,plantel,galeria}/` y JSON que las referencia mediante rutas relativas. El sincronizador histórico también contenía la operación Tally privado -> descarga -> archivo local -> referencia pública.

La versión actual recupera ese patrón, manteniendo los controles de privacidad incorporados después.

## Flujo canónico

Tally / Google Sheet
→ `PUBLICO_EXPORT`
→ URL privada firmada sólo durante el sync
→ runner QA
→ validación de origen, tipo y tamaño
→ archivo local `preview-v8/media/<modulo>/...`
→ JSON con ruta relativa `media/<modulo>/...`
→ contrato público
→ E2E
→ commit QA de datos + medios
→ snapshot `main/qa-v8-google`.

La URL firmada nunca se escribe en el JSON público ni en el repositorio.

## Controles de seguridad

Para materialización automática desde Tally:

- origen inicial exacto: `https://storage.tally.so/private/...`;
- máximo 10 MiB por archivo;
- tiempo máximo de descarga: 20 segundos;
- tipos aceptados: JPEG, PNG, WEBP, GIF y AVIF;
- el contenido binario debe coincidir con la firma básica del MIME declarado;
- el nombre público se deriva de SHA-256 del contenido, no del token firmado;
- errores de descarga no imprimen la URL firmada;
- una referencia privada no descargable detiene el sync en vez de publicar una referencia insegura o inventar una imagen.

## Semántica por módulo

- **Noticias:** una imagen por registro; el campo sigue siendo opcional si no se entregó imagen.
- **Plantel:** una foto por jugador; el campo sigue siendo opcional si no se entregó foto.
- **Galería:** admite varias imágenes privadas en un mismo registro. Cada archivo materializado produce un item público con ID estable derivado del registro y su posición. Si no existe imagen segura, el registro no puede publicarse.

## Contrato de referencias locales

`validate_data.py` exige que toda referencia relativa de imagen:

- permanezca dentro del árbol `preview-v8`;
- use una extensión web admitida;
- apunte a un archivo que exista realmente.

Las URLs HTTPS públicas continúan permitidas, pero siguen prohibidas las referencias Tally privadas o URLs con `accessToken` / `signature`.

## CI y autoridad

El único pipeline que materializa y publica estos medios es `.github/workflows/sync-qa-google-data.yml`.

Los archivos generados bajo `preview-v8/media/**` y `preview-v8/data/**` se committean juntos. Ambos paths están excluidos de los triggers de push del propio sync para evitar bucles. Un cambio de código, contrato o workflow sí vuelve a ejecutar el pipeline completo.

## Gate de adopción

Este patrón sólo queda ACTIVO EN QA cuando un sync live demuestra simultáneamente:

1. descarga de las referencias privadas actuales sin exponer sus firmas;
2. generación de archivos locales válidos;
3. JSON sin credenciales privadas;
4. contratos PASS;
5. render E2E PASS;
6. commit de datos + medios en QA;
7. publicación del snapshot en `main`.

Si las URLs firmadas actuales están vencidas o no son accesibles desde el runner, ése será un bloqueo real de fuente y no se sustituirá con placeholders.