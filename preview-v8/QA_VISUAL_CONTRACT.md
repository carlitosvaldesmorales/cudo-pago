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
- **Tabla de posiciones dentro del primer bloque útil**, antes del listado largo de fixture/resultados.
- Próxima jornada presentada como CUDO vs rival, agrupando Tercera, Segunda, Senior y Primera.
- Los cuatro partidos de una misma jornada no pueden sentirse como cuatro eventos sin relación.
- Fixture histórico/resultados queda después de tabla + jornada.

### Equipos
- Los jugadores/fotografía aparecen temprano.
- Las cuatro categorías no pueden ser cuatro tarjetas genéricas visualmente idénticas.
- Plantel legible por categoría y posición.

### Noticias
- Portada editorial con historia principal.
- Fotografías sin watermark.
- Fotografías mock no deben sugerir falsamente que son registros reales de CUDO.

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
- 84 jugadores mock.
- 108 partidos mock.
- 44 filas de tabla.
- 6 noticias mock.
- 15 fotografías mock.

El volumen debe probar el diseño, pero su naturaleza técnica solo aparece en `?qa=1`.

## 6. Inspección obligatoria
El QA debe:
1. recorrer la página COMPLETA, no solo top + 50%;
2. generar full-page screenshots de las seis vistas y tres viewports;
3. capturar secciones críticas individualmente (hero, tabla/jornada, plantel, noticia principal, galería, footer);
4. probar menú móvil, filtros de plantel, filtros de partidos, tabla, álbumes y lightbox;
5. revisar imágenes rotas/watermarks obvios y consola;
6. comprobar orden visual de secciones críticas;
7. comparar contra baselines aprobados cuando existan.

## 7. Criterio de rechazo inmediato
FAIL si:
- tabla de posiciones de Partidos está al final;
- seed/mock/brief aparece como mensaje público;
- escudo pegado/sobredimensionado;
- una foto con watermark llega al render;
- Galería muestra controles antes de contenido fotográfico;
- Equipos es selector genérico sin protagonismo de jugadores;
- las seis páginas repiten la misma composición sin función propia;
- una jornada de cuatro categorías no se entiende como una sola fecha/rival.

## 8. Aprobación
Solo se marca **QA VISUAL PASS** cuando:
- contratos/datos pasan;
- navegador pasa en 3 viewports;
- inspección completa pasa;
- interacciones pasan;
- 0 fallas reales;
- el render respeta `DESIGN_MARKETING_CONTRACT.md`.

**Regla:** commit exitoso ≠ diseño aprobado. Deploy exitoso ≠ QA visual aprobado.