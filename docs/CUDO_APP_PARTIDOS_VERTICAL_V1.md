# CUDO App · Vertical Partidos v1

Estado: **VALIDADO CON EVIDENCIA**

Este documento no redefine la arquitectura. Describe el flujo actualmente materializado para Partidos y referencia el contrato ejecutable `preview-v8/contracts/partidos-v1.json`.

## Objetivo

Mantener en una sola vertical trazable el recorrido completo:

`Google Form -> RAW_FORM_PARTIDOS -> CONTROL -> PUBLICO_EXPORT -> preview-v8/data/partidos.json -> renderer V8`

La capa de soporte del proyecto (OpenProject/front door/GitHub) organiza y registra el trabajo, pero CUDO App define qué se construye.

## Captura humana

`FORM_SPEC` define 14 preguntas del formulario QA y su destino RAW.

1. Competencia -> `COMPETENCIA`
2. Jornada o fecha del campeonato -> `JORNADA`
3. Fecha del partido -> `FECHA`
4. Hora del partido -> `HORA`
5. Serie o categoría -> `CATEGORIA`
6. Equipo local -> `LOCAL`
7. Equipo visitante -> `VISITA`
8. Cancha o recinto -> `RECINTO`
9. Estado del partido -> `ESTADO_PARTIDO`
10. Goles del equipo local -> `GOLES_LOCAL`
11. Goles del equipo visitante -> `GOLES_VISITA`
12. ¿De dónde proviene esta información? -> `FUENTE`
13. Nombre de quien registra la información -> `RESPONSABLE`
14. Cambio, suspensión u observación para revisión -> `OBSERVACIONES`

`RAW_FORM_PARTIDOS` es append-only y replica las respuestas del formulario.

## CONTROL

`CONTROL` deriva automáticamente los datos capturados y aplica dos mecanismos separados:

- `CORRECCIONES`: puede reemplazar los datos operativos de una fila identificada por `ID_PARTIDO`.
- `REVISION`: resuelve la decisión editorial `ESTADO_REGISTRO`, `PUBLICAR` y `PRIVACIDAD`.

`ID_PARTIDO` se genera desde el timestamp de la respuesta y el número de fila.

Campos editoriales humanos:

- `ESTADO_REGISTRO`
- `PUBLICAR`
- `PRIVACIDAD`
- `FECHA_REVISION`

Campos internos que nunca forman parte del JSON público:

- `JORNADA`
- `FUENTE`
- `RESPONSABLE`
- `OBSERVACIONES`
- campos editoriales anteriores

## PUBLICO_EXPORT

Una fila llega a `PUBLICO_EXPORT` únicamente cuando cumple simultáneamente:

- `ESTADO_REGISTRO = PUBLICADO`
- `PUBLICAR = SI`
- `PRIVACIDAD = PUBLICO`

Columnas públicas actuales:

- `id`
- `competencia`
- `fecha`
- `hora`
- `categoria`
- `local`
- `visita`
- `recinto`
- `estado_partido`
- `goles_local`
- `goles_visita`

## Sincronización y CI

La rama `qa-v8-google-data` ejecuta `preview-v8/tools/sync_google_publico.mjs` contra `PUBLICO_EXPORT`.

Para Partidos, el sync:

- lee la planilla `CUDO_WEB_PARTIDOS_2026`;
- convierte `goles_local` y `goles_visita` a número;
- genera `preview-v8/data/partidos.json` con `schema_version=1.0` y `source=CUDO_WEB_PARTIDOS`;
- ejecuta `preview-v8/tools/validate_data.py`;
- ejecuta validación E2E Google -> V8;
- publica el snapshot validado en `main/qa-v8-google`.

## Contrato público ejecutable

Fuente canónica de esta vertical:

`preview-v8/contracts/partidos-v1.json`

El validador debe obtener desde ese archivo:

- campos requeridos y permitidos;
- estados válidos;
- unicidad;
- regla de marcador para `FINALIZADO`.

De esta forma, la documentación y la generación/validación de la app comparten contrato.

## Renderer V8

El frontend carga `partidos.json` y agrupa las filas CUDO por:

`fecha + rival + estado_partido`

El rival se resuelve según cuál lado contiene `CUDO`.

Orden visual de categorías:

1. TERCERA
2. SEGUNDA
3. SENIOR
4. PRIMERA

Una jornada programada muestra horario. Una jornada finalizada muestra marcador. La tarjeta destacada prefiere la próxima jornada `PROGRAMADO`; si no existe, usa la última `FINALIZADO`.

## Invariantes

- El formulario captura; no publica.
- `CONTROL` decide y corrige.
- `PUBLICO_EXPORT` es el contrato público humano.
- El JSON no puede exponer campos internos/privados.
- `JORNADA` sigue siendo administrativa y no se publica.
- QA y PROD deben usar el mismo schema público.
- Una jornada CUDO vs rival debe mantener consistente rival/fecha/estado entre sus categorías.

## Próximo incremento

Cerrar automáticamente la consistencia entre `FORM_SPEC`, `PUBLICO_EXPORT`, el contrato ejecutable y el renderer. Luego replicar el patrón a Noticias, Equipos, Plantel, Tabla y Galería sin inventar otra arquitectura.
