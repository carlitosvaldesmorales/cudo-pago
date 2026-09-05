# CUDO V8 — Contrato visual de Inicio

Este documento es memoria operativa del proyecto. La portada no se considera aprobada porque compile, no desborde o tenga todos sus elementos. Debe conservar la intención de diseño y marketing en el render final.

## Regla raíz

El Inicio es una vista editorial propia. No debe construirse como una copia de las páginas interiores ni como una suma de componentes técnicos.

## Hero

- Un solo protagonista visual: fotografía del estadio/comunidad + claim principal.
- El escudo vive en la cabecera. No se repite como objeto grande, pegado o competidor dentro del hero.
- No mostrar badges técnicos, QA, seed, preview ni lenguaje de laboratorio.
- El claim debe dominar antes que botones, etiquetas o metadatos.
- Tercera, Segunda, Senior y Primera pueden aparecer como información secundaria, nunca como pills que compitan con el claim.
- Desktop y móvil deben ser la misma dirección de arte adaptada, no dos diseños distintos.

## Ley de identidad fotográfica CUDO

Las fotografías documentales del club son evidencia visual real. Rostros, escudo, camisetas, lienzos, banderas y textos reales son zonas inmutables.

- La IA generativa no puede reinterpretar, reemplazar ni redibujar personas, caras, escudos, camisetas, lienzos, banderas o textos reales.
- Se permite mejora no generativa: super-resolución, reducción de ruido, nitidez, contraste, color y luminosidad, siempre preservando los píxeles e identidad documental.
- Si fuese necesario extender una imagen, solo pueden generarse zonas neutras que no alteren identidad; la zona documental original debe conservarse intacta.
- Una imagen no pasa QA porque simplemente cargue o tenga resolución nominal suficiente. Debe revisarse en el tamaño, recorte y ampliación reales del hero.
- Si el render muestra pérdida visible de nitidez, deformación, caras alteradas, escudo modificado o textos reinterpretados, el resultado queda rechazado aunque el pipeline técnico esté verde.
- Para el hero aprobado del estadio, el asset debe vivir como archivo real del repositorio; no debe ocultarse como una fotografía base64 gigante incrustada en CSS.

## Jornada

- La próxima jornada tiene prioridad sobre la jornada anterior.
- La unidad visual es CUDO vs rival y dentro de ella Tercera, Segunda, Senior y Primera.
- Debe sentirse como matchday, no como planilla administrativa.
- El enlace a tabla/calendario es secundario pero visible.

## Noticias

- Tres historias visibles en portada.
- Una historia principal y dos secundarias deben formar una composición editorial cerrada.
- Prohibido dejar un gran vacío blanco por una grilla mal resuelta.
- Ninguna imagen rota, watermark o placeholder técnico puede ser visible.

## Categorías

- Las cuatro categorías deben leerse rápido sin convertir la portada en cuatro bloques gigantes repetidos.
- El sello CUDO debe aparecer por sistema visual, no por repetir el escudo en cada tarjeta.
- En móvil deben mantenerse compactas para no alargar artificialmente la página.

## Galería

- La fotografía es protagonista desde el inicio de la sección.
- Composición editorial/masonry, no seis tarjetas idénticas.
- Ningún placeholder azul o imagen rota es aceptable.
- El texto acompaña a la imagen y no la domina.

## Marketing / cierre

- La sección de socio debe explicar propósito antes que precio.
- El CTA principal debe ser inequívoco.
- El cierre debe reforzar identidad y territorio.

## Gate obligatorio

Antes de promover una modificación del Inicio a main:
1. QA funcional y responsive.
2. Captura full-page desktop y móvil del commit candidato.
3. Revisión visual humana contra este contrato.
4. Verificación específica de nitidez e identidad de cualquier fotografía principal.
5. Si existe una desviación visible, el pipeline verde no autoriza publicación.
6. Solo después de la revisión visual se promueve a main/GitHub Pages.
