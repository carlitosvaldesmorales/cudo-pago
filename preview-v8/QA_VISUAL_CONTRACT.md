# CUDO V8 · Contrato de QA visual

Este documento es el gate entre **Diseño/Marketing** y **Programación**. Su fuente de intención es `DESIGN_MARKETING_CONTRACT.md`.

## Principio
Un cambio técnicamente correcto NO se considera aprobado si el render final pierde composición, jerarquía, narrativa o función. Contar elementos no equivale a mirar el diseño.

## 1. Identidad transversal
- Franja institucional amarillo · azul · rojo visible y discreta.
- Escudo CUDO integrado; se rechaza si compite con el contenido, queda borroso, pegado o sobredimensionado.
- Azul profundo base; rojo acción/competencia; amarillo acento.
- Titulares `Barlow Condensed`; texto funcional `Inter`.
- Todas las vistas comparten ADN, pero NO pueden ser clones de una misma plantilla.

## 2. Marketing y lenguaje público
- Fútbol/club/comunidad primero.
- `HAZTE SOCIO` conserva jerarquía de CTA sin dominar la vista.
- Cero lenguaje técnico visible: `QA`, `SEED`, `MOCK`, `PREVIEW`, `Fuente pública`, `contrato`, instrucciones de diseño o implementación.
- El copy debe hablar al visitante, nunca describir cómo debería verse la página.

## 3. Reglas por vista
### Inicio
- Fotografía protagonista.
- Escudo secundario e integrado.
- Próxima jornada/último resultado visibles temprano.
- La composición desktop/tablet/móvil conserva el mismo protagonista.

### Partidos
- **Tabla de posiciones dentro del primer bloque útil**, antes del listado de fechas/resultados.
- Próxima jornada presentada como CUDO vs rival, agrupando Tercera, Segunda, Senior y Primera.
- El calendario principal de club muestra las jornadas de CUDO, no una pared con todos los partidos de los 11 clubes.
- Los cuatro partidos de una misma jornada no pueden sentirse como cuatro eventos sin relación.
- Resultados y próximas fechas quedan después de tabla + jornada.

### Equipos
- Los jugadores/fotografía aparecen temprano.
- Las cuatro categorías no pueden ser cuatro tarjetas genéricas visualmente idénticas.
- Plantel legible por categoría y posición.

### Noticias
- Portada editorial con historia principal.
- Fotografías sin watermark.
- Fotografías de demostración no deben sugerir falsamente que son registros reales de CUDO.

### Galería
- Fotografías visibles antes que filtros administrativos.
- Álbumes con portada fotográfica.
- Filtros compactos/secundarios.

### El Club
- Narrativa institucional propia con alternancia visual.
- No secuencia genérica de cards.
- No inventar hechos institucionales.

## 4. Responsive
Viewports mínimos:
- Desktop 1440 × 1000
- Tablet 1024 × 900
- Mobile 390 × 844

En todos:
- Sin overflow horizontal.
- Misma dirección de arte adaptada; no se resuelve móvil eliminando al protagonista de desktop.
- Tablas pueden hacer scroll dentro de su contenedor.
- Menú móvil usable y `HAZTE SOCIO` disponible.

## 5. Datos representativos
Mientras producción no alimente contratos:
- 4 categorías.
- 84 jugadores de demostración.
- estructura de campeonato con 11 clubes y 2 grupos.
- 44 filas de tabla.
- 6 noticias.
- 15 fotografías.

El volumen debe probar el diseño, pero su naturaleza técnica solo aparece en `?qa=1`.

## 6. Inspección obligatoria
El QA debe:
1. recorrer la página COMPLETA y disparar carga lazy antes de capturar;
2. generar full-page screenshots de las seis vistas y tres viewports;
3. capturar secciones críticas individualmente;
4. probar menú móvil, filtros de plantel, filtros de jornadas, tabla, álbumes y lightbox;
5. restaurar el estado inicial después de probar interacciones y antes de capturar;
6. revisar imágenes rotas/watermarks obvios y consola;
7. comprobar orden visual de secciones críticas;
8. comparar contra baselines aprobados cuando existan.

## 7. Higiene de arquitectura
- V8 no puede cargar lógica de navegación, rutas o compatibilidad desde `preview-v7` ni otra versión anterior.
- Un preview anterior puede conservarse como rollback, pero nunca ser dependencia runtime de V8.
- El runtime V8 debe ser explícito y autocontenido.

## 8. Criterio de rechazo inmediato
FAIL si:
- tabla de posiciones de Partidos queda al final;
- seed/mock/brief aparece como mensaje público;
- escudo pegado/sobredimensionado;
- una foto con watermark llega al render;
- Galería muestra controles antes de contenido fotográfico;
- Equipos es selector genérico sin protagonismo de jugadores;
- las seis páginas repiten la misma composición sin función propia;
- una jornada de cuatro categorías no se entiende como una sola fecha/rival;
- el calendario de Partidos se transforma en una lista interminable de partidos ajenos a CUDO;
- V8 depende en runtime de código de `preview-v7`.

## 9. Aprobación
Solo se marca **QA VISUAL PASS** cuando:
- contratos/datos pasan;
- navegador pasa en 3 viewports;
- inspección completa pasa;
- interacciones pasan;
- 0 fallas reales;
- el render respeta `DESIGN_MARKETING_CONTRACT.md`;
- y el baseline visual es aprobado por humano.

**Regla:** commit exitoso ≠ diseño aprobado. Deploy exitoso ≠ QA visual aprobado.