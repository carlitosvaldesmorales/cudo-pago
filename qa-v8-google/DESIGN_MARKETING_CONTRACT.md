# CUDO V8 · Contrato de Diseño, Marketing y UX

Este archivo es la memoria operativa del diseño. La conversación no reemplaza este contrato.

## Regla raíz
El sistema visual puede repetirse; la composición de cada módulo NO. Cada vista debe conservar el ADN CUDO, pero responder a su función real. Una pantalla técnicamente correcta se rechaza si la intención del diseñador se pierde en el render.

## ADN CUDO transversal
- Azul profundo como base institucional.
- Rojo para competencia/acción y amarillo como acento.
- Escudo integrado a la composición; nunca pegado como objeto gigante o accidental.
- Barlow Condensed para titulares deportivos e Inter para lectura funcional.
- Fotografía como contenido, no como relleno.
- Franja amarillo · azul · rojo como firma discreta.
- La vista debe seguir pareciendo CUDO aun si se oculta el nombre del módulo.
- No se publica lenguaje de laboratorio: QA, seed, mock, fuente pública, contrato, preview o instrucciones al diseñador.

## Inicio
Orden visual obligatorio:
1. Hero CUDO con fotografía protagonista e identidad integrada.
2. Próxima jornada / último resultado como experiencia de partido.
3. Tabla de posiciones resumida o acceso visible al campeonato.
4. Noticias.
5. Equipos/categorías.
6. Galería.
7. Socios/colabora.

El escudo del hero es apoyo, nunca protagonista por sobre el mensaje o la fotografía.

## Partidos
Partidos representa cómo vive el fútbol amateur CUDO, no una lista administrativa.

Orden obligatorio:
1. Contexto de campeonato y próxima jornada.
2. TABLA DE POSICIONES visible en el primer bloque útil; nunca enterrada al final.
3. Jornada agrupada por rival/localía y fecha.
4. Dentro de cada jornada: Tercera → Segunda → Senior → Primera.
5. Resultados y próximas fechas como vistas secundarias.

Una fecha se entiende primero como CUDO vs rival; las cuatro categorías son parte de la misma jornada.

## Equipos
- Las personas son protagonistas.
- La portada de Equipos presenta cada categoría con imagen/composición y volumen de plantel.
- No se aceptan cuatro tarjetas genéricas idénticas con solo el nombre CUDO.
- Plantel ordenado por categoría y posición: arqueros, defensas, volantes, delanteros.
- Dorsal, nombre deportivo y fotografía tienen jerarquía.

## Noticias
- Debe sentirse editorial/deportivo, no dashboard ni blog genérico.
- La primera historia tiene jerarquía clara.
- Fotos mock deben ser visualmente limpias y sin marcas de agua.
- No usar fotografías ajenas que hagan parecer que son imágenes reales de CUDO.
- El copy público habla al socio/hincha/comunidad; jamás explica el brief del diseñador.

## Galería
- La fotografía aparece inmediatamente como protagonista.
- Álbumes usan portada fotográfica; no simples cajas de texto.
- Filtros son secundarios y compactos.
- El visitante debe ver imágenes antes que controles administrativos.
- Lightbox conserva el sello CUDO sin tapar la imagen.

## El Club
- Debe contar una historia institucional propia, no parecer una landing genérica.
- Ejes: cancha/estadio, comunidad, fútbol, Cudito, infraestructura y pertenencia.
- Alternar fotografía y narrativa; evitar una secuencia de cards homogéneas.
- No inventar historia, fundación, autoridades ni hitos no respaldados.

## Responsive
Responsive significa misma dirección de arte adaptada, no dos diseños distintos.
- Desktop, tablet y móvil deben conservar el mismo protagonista y jerarquía.
- Nada debe aparecer gigante en desktop y desaparecer como solución en móvil.
- No overflow horizontal.
- CTA y navegación accesibles sin competir con el contenido.

## Regla de datos de demostración
Los datos seed sirven para dimensionar producción, pero el usuario normal no debe leer mensajes técnicos sobre seed/mock. QA puede habilitar información técnica solo con `?qa=1`.

## Criterio de rechazo inmediato
Se rechaza una vista aunque compile si ocurre cualquiera de estos casos:
- escudo pegado o sobredimensionado;
- watermark o fotografía visualmente impropia;
- lenguaje de brief/QA visible al público;
- mismo hero/composición clonado en todas las páginas;
- información principal enterrada (ej. tabla de posiciones al final);
- fotografía secundaria en Galería;
- jugadores secundarios en Equipos;
- cuatro partidos de una jornada presentados sin relación entre sí;
- diseño responsive con jerarquía distinta sin razón funcional.
