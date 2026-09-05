# CUDO-WEB-UX-01 — Mapeo técnico real

Fecha: 2026-09-05
Estado: **GAP-01 CERRADO PARA IMPLEMENTACIÓN QA**
Base: inspección directa de FORM_SPEC, CONTROL/hoja canónica, PUBLICO_EXPORT, sincronizador Google→JSON y renderer V8.

> Este documento es evidencia de implementación. No constituye certificación UX. El veredicto independiente corresponde a QA/Uxia.

## Contrato común

Flujo preservado:

`Formulario humano → Google Sheet → RAW_FORM_* → CONTROL/canónico → PUBLICO_EXPORT → JSON → CUDO V8`

La sincronización V8 lee exclusivamente `PUBLICO_EXPORT!A:Z` de los seis spreadsheets y convierte a número los campos numéricos de Plantel, Partidos y Tabla.

## Matriz real por dominio

### Noticias

FORM_SPEC actual: Fecha de publicación → FECHA; Título → TITULO; Resumen → RESUMEN; Cuerpo → CUERPO; Referencia/URL imagen → IMAGEN_REF; Fuente → FUENTE; Responsable → RESPONSABLE; Observaciones → OBSERVACIONES.

Canónico real (`NOTICIAS`): ID_NOTICIA, FECHA, SLUG, TITULO, RESUMEN, CUERPO, IMAGEN_REF, ESTADO, PUBLICAR, FUENTE, CLASIFICACION, PRIVACIDAD, RESPONSABLE, FECHA_REVISION, OBSERVACIONES, AUTORIZACION_PUBLICACION.

PUBLICO_EXPORT real: `id, fecha, slug, titulo, resumen, cuerpo, imagen_ref`.

V8 consume en tarjeta: `fecha, titulo, resumen, imagen_ref`; el cuerpo/slug quedan disponibles en contrato de datos aunque la tarjeta actual no los renderiza.

UX especialista → contrato real:
- tipo de noticia: **nuevo dato humano**, requiere destino canónico CLASIFICACION/catalogación;
- título/resumen/cuerpo: conservar, renombrar UI/ayuda;
- fecha del hecho: reutiliza FECHA, cambiando semántica UI;
- fotografía: sustituir IMAGEN_REF humano por archivo y normalización técnica a IMAGEN_REF cuando GAP-03 cierre;
- descripción accesible: **GAP de esquema**: PUBLICO_EXPORT Noticias no expone `alt`; requiere ampliación compatible si se implementa;
- fuente/responsable genéricos: ocultar/derivar según contrato UX;
- ID/slug/estado/publicación/privacidad/autorización/timestamps: técnicos, no humanos.

### Equipos / Series

FORM_SPEC actual: Nombre → NOMBRE; Categoría → CATEGORIA; Descripción → DESCRIPCION; Foto → FOTO_REF; Fuente → FUENTE; Responsable → RESPONSABLE; Observaciones → OBSERVACIONES.

CONTROL real: ID_EQUIPO, NOMBRE, CATEGORIA, DESCRIPCION, FOTO_REF, ESTADO_REGISTRO, PUBLICAR, PRIVACIDAD, AUTORIZACION_PUBLICACION, FUENTE, RESPONSABLE, FECHA_REVISION, OBSERVACIONES.

PUBLICO_EXPORT real: `id, nombre, categoria, descripcion`.

V8 consume: `categoria, nombre, descripcion`; **la foto de equipo no se consume actualmente**: V8 renderiza badge CUDO.

UX especialista → contrato real:
- serie/equipo: mapear a NOMBRE/CATEGORIA sin duplicar concepto;
- temporada/entrenador/nombre público alternativo: no existen ni se renderizan hoy → **no agregarlos a captura hasta decisión de expansión del contrato V8**;
- foto: condicional del especialista; como V8 actual no la muestra, **no pedirla en UX actual**;
- estado público: traducir a controles técnicos sólo mediante flujo administrativo, no exponer valores de pipeline.

### Plantel / Jugadores

FORM_SPEC actual: Nombre deportivo → NOMBRE_DEPORTIVO_PUBLICO; Número → NUMERO; Posición → POSICION; Categoría → CATEGORIA; Foto → FOTO_REF; Capitán → CAPITAN; Fuente → FUENTE; Observaciones → OBSERVACIONES_VALIDACION.

Canónico real `PLANTEL_CONTROL`: ID_INTERNO, NOMBRE_ORIGEN, CONDICION, NOMBRE_DEPORTIVO_PUBLICO, NUMERO, POSICION, CATEGORIA, FOTO_REF, CAPITAN, ESTADO, PUBLICAR, PRIVACIDAD, AUTORIZACION_PUBLICACION, FUENTE, OBSERVACIONES_VALIDACION.

PUBLICO_EXPORT real: `id, nombre_deportivo, numero, posicion, categoria, foto_ref, capitan`.

V8 consume todos esos campos; `foto_ref` pasa por safeImage y el filtro usa categoría/posición.

UX especialista → contrato real:
- serie: corresponde al catálogo CATEGORIA actual, salvo cambio posterior de nomenclatura;
- temporada: no existe ni V8 la consume → no agregar todavía;
- nombre/número/posición: conservar con lenguaje humano;
- foto: sustituir URL por carga cuando GAP-03 cierre; normalizar a FOTO_REF;
- autorización: CONTROL ya posee AUTORIZACION_PUBLICACION, pero no viene del formulario actual; debe resolverse mediante gate de revisión/política, especialmente menores;
- capitán: V8 sí lo consume, por lo tanto no eliminar silenciosamente aunque el contrato especialista no lo enumere como pregunta principal; requiere reconciliación UX antes de producción.

### Partidos / Fechas / Resultados

FORM_SPEC actual: Competencia, Jornada, Fecha, Hora, Categoría, Local, Visita, Recinto, Estado, Goles local, Goles visita, Fuente, Responsable, Observaciones.

CONTROL real: ID_PARTIDO, COMPETENCIA, JORNADA, FECHA, HORA, CATEGORIA, LOCAL, VISITA, RECINTO, ESTADO_PARTIDO, GOLES_LOCAL, GOLES_VISITA, ESTADO_REGISTRO, PUBLICAR, PRIVACIDAD, FUENTE, RESPONSABLE, FECHA_REVISION, OBSERVACIONES.

PUBLICO_EXPORT real: `id, competencia, fecha, hora, categoria, local, visita, recinto, estado_partido, goles_local, goles_visita`.

UX especialista → contrato real:
- “qué desea registrar” es control de ramificación, no dato público;
- serie → CATEGORIA;
- rival + localía deben transformarse determinísticamente a LOCAL/VISITA;
- fecha/hora/recinto/estado/goles conservan destino real;
- jornada existe en CONTROL pero no sale a PUBLICO_EXPORT; puede conservarse como dato interno si es necesario;
- fuente/responsable/observaciones son trazabilidad, no contenido público;
- ganador/empate/acumulados no son campos del contrato público actual.

### Tabla

FORM_SPEC actual: Competencia, Categoría, Posición, Equipo, PJ, PG, PE, PP, GF, GC, DG, PTS, Fuente, Responsable, Observaciones.

CONTROL real: ID_TABLA, COMPETENCIA, CATEGORIA, POSICION, EQUIPO, PJ, PG, PE, PP, GF, GC, DG, PTS, ESTADO_REGISTRO, PUBLICAR, PRIVACIDAD, FUENTE, RESPONSABLE, FECHA_REVISION, OBSERVACIONES.

PUBLICO_EXPORT real: `id, competencia, categoria, posicion, equipo, pj, pg, pe, pp, gf, gc, dg, pts`.

V8 agrupa por competencia+categoría, ordena por posición y muestra POS/EQUIPO/PJ/PG/PE/PP/GF/GC/DG/PTS.

UX especialista → contrato real:
- DG debe dejar de ser entrada humana y calcularse `GF-GC`;
- posición no puede eliminarse hasta cerrar GAP-06 (reglas de desempate), porque V8 la necesita para ordenar;
- PTS debe conservarse como entrada oficial mientras las reglas/sanciones no estén modeladas;
- competencia/categoría/equipo/estadísticas se conservan;
- corte de jornada/evidencia oficial no existen en salida V8: pueden ser trazabilidad administrativa sin expandir JSON;
- cálculo integral desde Partidos queda bloqueado por GAP-06.

### Galería

FORM_SPEC actual: ALBUM_ID, ALBUM, FECHA, CATEGORIA, TITULO, DESCRIPCION, IMAGEN_REF, ALT, CONTIENE_MENORES, FUENTE, RESPONSABLE, OBSERVACIONES.

CONTROL real: ID_FOTO, ALBUM_ID, ALBUM, FECHA, CATEGORIA, TITULO, DESCRIPCION, IMAGEN_REF, ALT, CONTIENE_MENORES, AUTORIZACION_MENORES, ESTADO_REGISTRO, PUBLICAR, PRIVACIDAD, AUTORIZACION_PUBLICACION, FUENTE, RESPONSABLE, FECHA_REVISION, OBSERVACIONES.

PUBLICO_EXPORT real: `id, album_id, album, fecha, categoria, titulo, descripcion, imagen_ref, alt`.

V8 consume todos los campos públicos; además usa album_id/album/categoria/año para filtros y lightbox.

UX especialista → contrato real:
- ALBUM_ID es técnico y debe generarse/normalizarse desde evento/fecha;
- álbum/actividad → ALBUM; fecha → FECHA; categoría/tipo requiere reconciliar catálogo existente con lenguaje humano;
- múltiples archivos en una respuesta requieren fan-out a una fila canónica por fotografía para preservar el contrato actual;
- ALT debe mantenerse/generarse con contexto humano;
- menores/autorización ya tienen gates canónicos: una foto con menores sólo sale si AUTORIZACION_MENORES=AUTORIZADO y AUTORIZACION_PUBLICACION=AUTORIZADO;
- fuente/responsable genéricos deben derivarse/ocultarse.

## Hallazgos bloqueantes descubiertos

1. **Publicación inmediata en Partidos y Tabla:** CONTROL actual fija `PUBLICADO / SI / PUBLICO` en la fila de fórmula. Contradice el contrato UX, que exige Pendiente de revisión por defecto. Debe corregirse antes de liberar.
2. **Equipos no usa fotografía en V8:** pedirla hoy sería carga humana sin efecto visible.
3. **Plantel: Capitán sí es contrato V8:** no puede perderse durante el rediseño.
4. **Tabla: posición sigue siendo necesaria hasta validar desempates oficiales (GAP-06). DG sí es calculable inmediatamente.**
5. **Noticias no tiene ALT público:** el requisito de descripción accesible necesita extensión compatible o decisión explícita.
6. **Galería multiarchivo:** el modelo público es una fila por foto; una carga múltiple necesita transformación fan-out.
7. **Formularios existentes no pueden actualizar preguntas con el provisionador actual:** al detectar FORM_ID existente sólo actualiza título/descripción y valida cantidad. Para materializar UX se debe implementar reconciliación idempotente de ítems o estrategia segura de reemplazo/migración.

## Estado de GAP-01

CERRADO para implementación QA: ya existe evidencia de pregunta → destino → canónico → PUBLICO_EXPORT → JSON → consumo V8 para los seis dominios.

Quedan abiertos, conforme al contrato especialista: GAP-02 imágenes V8; GAP-03 carga de archivo/Google; GAP-04 responsable institucional; GAP-05 política de menores; GAP-06 reglas deportivas/desempates; GAP-07 capacidad galería.

## Gate

No liberar a producción ni declarar CONFORME. La implementación debe generar evidencia y pasar por QA independiente/Uxia.