# ADN · Adaptador Broadcast vMix v1

## Propósito

Permitir que vMix consuma resultados del campeonato ANFA Chépica 2026 sin crear una segunda fuente de verdad ni exigir doble digitación.

## Patrón reutilizado

CUDO conserva una sola fuente operacional de resultados. vMix es un consumidor de lectura.

```text
Telegram / gobernanza de resultados
        ↓
D1 + proyección de resultados existente
        ↓
buildRoundSnapshots()
        ↓
adaptador JSON vMix
        ↓
vMix Data Sources / GT Title
        ↓
YouTube
```

## Invariantes

- `VMIX_IS_READ_ONLY_CONSUMER`: vMix no escribe resultados.
- `NO_SECOND_SOURCE_OF_TRUTH`: el adaptador no persiste datos ni mantiene estado propio.
- `REUSE_EXISTING_RESULT_PROJECTION`: el feed deriva de `buildRoundSnapshots()`.
- `REUSE_EXISTING_CLUB_IDENTITY`: los escudos apuntan a los assets ya publicados bajo `https://cudo.cl/preview-v8/media/clubes/`.
- `REPORTED_NEQ_OFFICIAL`: un resultado `PENDIENTE` se presenta como `INFORMADO`; sólo `VERIFIED` se presenta como `OFICIAL`.
- `VMIX_ARRAY_CONTRACT`: el payload superior es un array plano; una fila representa una serie de un partido.
- `STABLE_ROW_KEY`: cada fila se identifica como `match_id:series_code`.
- `NO_CACHE`: el feed se entrega con `cache-control: no-store`.

## Endpoints

Friendly para operación:

`GET /vmix/fecha/{round}.json`

Canónico:

`GET /api/v1/broadcast/vmix/rounds/{round}`

Por defecto ambos entregan la proyección `reported`; `?mode=official` fuerza sólo la proyección oficial.

## Contrato de fila

Campos de presentación y mapeo para vMix:

- `row_key`
- `competition_id`
- `round_no`, `round_label`, `group_id`
- `match_id`
- `series_order`, `series_code`, `series_label`
- `home_id`, `home_name`, `home_crest_url`, `home_score`
- `away_score`, `away_id`, `away_name`, `away_crest_url`
- `has_result`
- `status_code`, `status_label`, `canonical`
- `source_label`, `updated_at`, `generated_at`

## Operación Fecha III

Una sola fuente vMix puede consumir `GET /vmix/fecha/3.json`. La respuesta contiene los cinco partidos de la Fecha III y sus cuatro series, es decir veinte filas estables. vMix selecciona la fila requerida mediante su Data Source/Title mapping; no se crean veinte endpoints.

## Escudos

El adaptador no genera ni duplica imágenes. Usa el catálogo existente por `club_id` y devuelve URL absoluta hacia `cudo.cl`.

## Fuera del adaptador

La creación visual del GT Title, su posición en pantalla y la configuración de refresco dentro de vMix pertenecen a la capa de presentación broadcast. No cambian el modelo de resultados ni la gobernanza CUDO.
