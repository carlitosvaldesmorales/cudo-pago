# CUDO App · Pipeline de medios v2

Estado: **ACTIVO EN QA · HEIC MÓVIL TÉCNICAMENTE MATERIALIZADO**

## Certificación QA vigente

Recertificado el 2026-09-14 por el pipeline canónico `CUDO V8 - sync QA Google data`, run **34851139816**.

Evidencia material del run:

- instalación del adaptador HEIC móvil en Node 24: PASS;
- sync Google real y materialización de las referencias privadas actuales de Tally: PASS;
- contratos públicos y renderer: PASS;
- render E2E Google → V8: PASS;
- responsive/media desktop, tablet y móvil: PASS;
- commit conjunto de datos + medios en `qa-v8-google-data`: PASS;
- publicación del snapshot validado en `main`: PASS.

Resultado persistente del run:

- QA: `7dc6092839f7e4f8755707ac5a84f9139af0cfd6`
- main: `467c52d39acde3dbe99618fae8113e34589ac76e`
- main message: `QA publish E2E: 34851139816`

La conversión HEIC/HEIF fue falsada antes del merge por CI run **34851058657** usando un archivo HEIC real y versionado (`gen2brain/heic`, commit `5cd2c8525f1d468ae77ed65b1d600248ad3e2e87`, `testdata/test8.heic`). El paso `Validar HEIC real a JPEG web` terminó PASS.

La certificación anterior del pipeline de medios fue el run **34774122168** del 2026-09-13.

## Evidencia recuperada

CUDO ya había materializado medios de Tally en el Pack 01 de V8. La rama histórica `cudo-review-media-01` contiene imágenes bajo `preview-v8/media/{noticias,plantel,galeria}/` y JSON que las referencia mediante rutas relativas. El sincronizador histórico también contenía la operación Tally privado -> descarga -> archivo local -> referencia pública.

La versión actual recupera ese patrón, manteniendo los controles de privacidad incorporados después.

## Flujo canónico

Tally / Google Sheet
→ `PUBLICO_EXPORT`
→ URL privada firmada sólo durante el sync
→ runner QA
→ si la entrada es HEIC/HEIF desde Tally privado: validación + conversión a JPEG
→ validación de origen, tipo y tamaño del medio web
→ archivo local `preview-v8/media/<modulo>/...`
→ JSON con ruta relativa `media/<modulo>/...`
→ contrato público
→ E2E
→ responsive/media gate
→ commit QA de datos + medios
→ snapshot `main/qa-v8-google`.

La URL firmada nunca se escribe en el JSON público ni en el repositorio. HEIC/HEIF es un formato de **entrada móvil**, no un formato público de salida.

## Controles de seguridad

Para materialización automática desde Tally:

- origen inicial exacto para conversión HEIC: `https://storage.tally.so/private/...`;
- máximo 10 MiB por archivo de entrada y por JPEG convertido;
- tiempo máximo de descarga: 20 segundos;
- salidas web admitidas por el materializador: JPEG, PNG, WEBP, GIF y AVIF;
- HEIC/HEIF se valida por MIME y firma `ftyp` antes de convertir;
- la salida de la conversión debe tener firma JPEG válida;
- el contenido binario debe coincidir con la firma básica del MIME declarado;
- el nombre público se deriva de SHA-256 del contenido materializado, no del token firmado;
- errores de descarga/conversión no imprimen la URL firmada;
- una referencia privada no descargable o no convertible detiene el sync en vez de publicar una referencia insegura o inventar una imagen.

La conversión está implementada en `preview-v8/tools/heic_media.mjs` y se activa sólo en la frontera Tally privada mediante `preview-v8/tools/sync_google_publico_with_heic.mjs`. El materializador canónico `sync_google_publico.mjs` conserva su contrato web.

## Semántica por módulo

- **Noticias:** una imagen por registro; el campo sigue siendo opcional si no se entregó imagen.
- **Plantel:** una foto por jugador; el campo sigue siendo opcional si no se entregó foto.
- **Galería:** admite varias imágenes privadas en un mismo registro. Cada archivo materializado produce un item público con ID estable derivado del registro y su posición. Si no existe imagen segura, el registro no puede publicarse.

Los formularios Tally activos de Noticias, Plantel y Galería aceptan HEIC como entrada móvil. El pipeline ya posee la compatibilidad técnica para transformarlo antes de publicación.

## Contrato de referencias locales

`validate_data.py` exige que toda referencia relativa de imagen:

- permanezca dentro del árbol `preview-v8`;
- use una extensión web admitida;
- apunte a un archivo que exista realmente.

Las URLs HTTPS públicas continúan permitidas, pero siguen prohibidas las referencias Tally privadas o URLs con `accessToken` / `signature`.

El runtime resuelve las rutas `media/...` contra la raíz pública de V8 derivada de `shared/site-runtime-v8.js`, no contra la subpágina actual. Así Noticias, Plantel y Galería consumen el mismo contrato de media desde cualquier ruta.

## CI y autoridad

El único pipeline que materializa y publica estos medios es `.github/workflows/sync-qa-google-data.yml`.

CI pre-merge ejecuta una conversión HEIC real antes de permitir adopción. El pipeline live instala las mismas dependencias exactas y usa el adaptador HEIC antes del sincronizador existente.

Los archivos generados bajo `preview-v8/media/**` y `preview-v8/data/**` se committean juntos. Ambos paths están excluidos de los triggers de push del propio sync para evitar bucles. Un cambio de código, contrato o workflow sí vuelve a ejecutar el pipeline completo.

## Gate de adopción

**Cerrado técnicamente:** compatibilidad HEIC/HEIF en la frontera móvil y pipeline completo sin regresiones.

**Pendiente de certificación física:** una submission real desde un teléfono/iPhone que cargue un archivo HEIC por uno de los formularios Tally activos y demuestre el camino completo:

`iPhone/Tally HEIC → Sheet → PUBLICO_EXPORT → runner → JPEG local → JSON → V8`.

El conector disponible de Tally permite leer submissions pero no crear una submission, por lo que esta última evidencia no puede fabricarse por API desde el agente.

Si una URL firmada vence, un HEIC no es decodificable o el JPEG convertido excede los límites, el pipeline debe detenerse como bloqueo de fuente; no se sustituye con placeholders.