# CUDO V8 — Contrato de sincronización de datos

## Objetivo
Separar captura/validación privada de la proyección pública. El frontend V8 consume únicamente JSON públicos en `preview-v8/data/`.

## Flujo
Google Sheets privados → validación/gates → sincronización → JSON GitHub → GitHub Pages → cudo.cl.

Los Sheets privados nunca se publican en Internet como fuente directa del navegador.

## Gates por módulo

### Noticias
Publicar solo cuando: `ID_NOTICIA` no vacío + `ESTADO=PUBLICADO` + `PUBLICAR=SI` + `PRIVACIDAD=PUBLICO` + `AUTORIZACION_PUBLICACION=AUTORIZADO`.
Salida: `id, fecha, slug, titulo, resumen, cuerpo, imagen_ref`.
Destino: `data/noticias.json`.

### Equipos
Publicar solo cuando: `ID_EQUIPO` no vacío + `ESTADO_REGISTRO=PUBLICADO` + `PUBLICAR=SI` + `PRIVACIDAD=PUBLICO` + `AUTORIZACION_PUBLICACION=AUTORIZADO`.
Salida: `id, nombre, categoria, descripcion`.
Destino: `data/equipos.json`.

### Plantel
Publicar solo cuando: `ID_INTERNO` no vacío + `ESTADO=PUBLICADO` + `PUBLICAR=SI` + `PRIVACIDAD=PUBLICO` + `AUTORIZACION_PUBLICACION=AUTORIZADO`.
Salida: `id, nombre_deportivo, numero, posicion, categoria, foto_ref, capitan`.
Nunca proyectar `NOMBRE_ORIGEN`, RUT, teléfono, dirección u otros datos privados.
Destino: `data/plantel.json`.

### Partidos
Publicar solo cuando: `ID_PARTIDO` no vacío + `ESTADO_REGISTRO=PUBLICADO` + `PUBLICAR=SI` + `PRIVACIDAD=PUBLICO`.
Salida: `id, competencia, fecha, hora, categoria, local, visita, recinto, estado_partido, goles_local, goles_visita`.
Destino: `data/partidos.json`.

### Tabla
Fuente oficial/manual mientras no exista evidencia de que se cargan todos los resultados de la competencia.
Publicar solo cuando: `ID_TABLA` no vacío + `ESTADO_REGISTRO=PUBLICADO` + `PUBLICAR=SI` + `PRIVACIDAD=PUBLICO`.
Salida: `competencia, categoria, posicion, equipo, pj, pg, pe, pp, gf, gc, dg, pts`.
Destino: `data/tabla.json`.
No derivar una tabla completa únicamente desde partidos de CUDO.

### Galería
Publicar solo cuando: `ID_FOTO` no vacío + `ESTADO_REGISTRO=PUBLICADO` + `PUBLICAR=SI` + `PRIVACIDAD=PUBLICO` + `AUTORIZACION_PUBLICACION=AUTORIZADO`.
Si `CONTIENE_MENORES=SI`, además exigir `AUTORIZACION_MENORES=AUTORIZADO`.
Salida: `id, album_id, album, fecha, categoria, titulo, descripcion, imagen_ref, alt`.
Destino: `data/galeria.json`.

## Modo de datos
`data/mode.json` controla el fallback visual:
- `seed`: módulos sin datos reales pueden usar seed/mock para QA y dimensionamiento.
- `production`: jamás mostrar seed/mock. Un módulo sin datos publicados debe mostrar estado vacío.

Cambiar a `production` requiere autorización humana explícita y validación previa de los JSON públicos.

## Regla de sincronización
La sincronización debe ser idempotente: comparar la proyección nueva con el JSON actual y no crear commits cuando el contenido público no cambió.

Cada JSON mantiene:
```json
{
  "schema_version": "1.0",
  "generated_at": "ISO-8601",
  "source": "CUDO_WEB_<MODULO>",
  "items": []
}
```

## Privacidad
La automatización solo puede leer campos privados para evaluar gates. Nunca debe copiarlos a GitHub, logs públicos, mensajes o JSON.

## Fuente operativa privada
Los IDs y URLs concretos de los Sheets viven en `CUDO_WEB_INDICE_DATOS_2026` dentro del Drive institucional; no se duplican en este repositorio público.
