# CUDO-WEB-UX-01 — Paquete para agente especialista

Estado: ACTIVO
Fecha: 2026-09-05

## Objetivo

Rediseñar la experiencia humana de administración del contenido visible actual de la web CUDO V8, sin cambiar el alcance funcional ni la arquitectura de datos ya certificada.

La persona usuaria objetivo es un dirigente/colaborador del club sin conocimientos de GitHub, JSON, Google Sheets ni Apps Script. Debe poder recibir un enlace y completar correctamente una tarea sin instrucciones adicionales por WhatsApp.

## Alcance obligatorio

Seis dominios actuales de V8:
1. Noticias
2. Equipos / Series
3. Plantel / Jugadores
4. Partidos / Fechas / Resultados
5. Tabla de posiciones
6. Galería

No ampliar todavía a socios, finanzas, estadio, Cudito u otros módulos.

## Arquitectura que NO debe romperse

Formulario humano → Google Sheet → RAW_FORM_* → CONTROL → PUBLICO_EXPORT → JSON → V8

Los seis dominios ya tienen captura técnica funcionando. El rediseño debe preservar compatibilidad con el contrato de datos vigente.

## Problema a resolver

Los formularios funcionan técnicamente, pero aún no están certificados como autoguiados para usuarios no técnicos. El especialista debe decidir, justificar y documentar:
- lenguaje de títulos e instrucciones;
- orden y agrupación de preguntas;
- ayudas y ejemplos;
- campos obligatorios/opcionales;
- listas cerradas versus texto libre;
- validaciones preventivas;
- eliminación de campos técnicos o calculables;
- requisitos de fotos y multimedia por contexto;
- mensajes posteriores al envío;
- tratamiento de errores y casos límite;
- si corresponde carga directa de archivos o referencia/URL y bajo qué condiciones;
- qué datos deben calcularse automáticamente;
- cómo minimizar errores y dependencia de Carlos.

## Evidencia actual de campos

### Noticias
- Fecha de publicación
- Título
- Resumen
- Cuerpo de la noticia
- Referencia o URL de imagen
- Fuente
- Responsable de carga
- Observaciones

### Equipos / Series
- Nombre del equipo
- Categoría
- Descripción
- Referencia o URL de foto
- Fuente
- Responsable de carga
- Observaciones

### Plantel / Jugadores
- Nombre deportivo público
- Número de camiseta
- Posición
- Categoría
- Referencia o URL de foto autorizada
- ¿Capitán?
- Fuente
- Observaciones de validación

### Partidos / Fechas / Resultados
- Competencia
- Jornada / Fecha
- Fecha del partido
- Hora
- Categoría
- Local
- Visita
- Recinto
- Estado del partido
- Goles local
- Goles visita
- Fuente
- Responsable de carga
- Observaciones

### Tabla de posiciones
- Competencia
- Categoría
- Posición
- Equipo
- PJ
- PG
- PE
- PP
- GF
- GC
- DG
- PTS
- Fuente de la tabla
- Responsable de carga
- Observaciones

### Galería
- ID o slug del álbum
- Nombre del álbum
- Fecha
- Categoría
- Título de la foto
- Descripción
- Referencia o URL de imagen
- Texto alternativo
- ¿La foto contiene menores?
- Fuente
- Responsable de carga
- Observaciones

## Regla de diseño

No pedir al usuario un dato que el sistema pueda derivar de forma confiable.
No exponer términos técnicos internos si no son necesarios para completar la tarea.
No asumir que el usuario sabe formatos, siglas o requisitos de imagen.
Cada requisito debe clasificarse como:
- EVIDENCIA
- REQUISITO DERIVADO
- PROPUESTA
- GAP

## Entregables exigidos al especialista

1. Matriz UX de los seis formularios, campo por campo.
2. Versión propuesta de cada formulario en lenguaje humano.
3. Requisitos de imágenes separados para Noticias, Equipos, Plantel y Galería.
4. Reglas de validación y prevención de errores.
5. Lista explícita de campos que deben eliminarse del ingreso humano por ser calculables/técnicos.
6. Casos de uso normales y casos límite.
7. Criterios objetivos de aceptación para QA independiente.
8. Decisiones que requieran aprobación de negocio de CUDO, si realmente existen.

## Gobernanza

El especialista NO certifica su propio diseño.
Después de implementación, un agente QA independiente debe evaluar el resultado y puede devolver NO CONFORME.
El entregable no se libera hasta obtener CONFORME independiente y evidencia.

Referencia de gobernanza: docs/CUDO_GOBERNANZA_AGENTES_Y_CERTIFICACION.md
