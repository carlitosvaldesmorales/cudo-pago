# CUDO Portal V8 — Brand-led redesign

V8 conserva contratos, seed y lógica funcional de V7, pero cambia la dirección de arte completa.

## Patrones de referencia
- Sitios oficiales de clubes: noticia destacada + match center + planteles filtrables + galería editorial.
- Calendario/matchday como contenido principal, no escondido.
- Fotografía y dorsal como protagonistas en planteles.
- Navegación institucional separada de la navegación deportiva.

## Sello CUDO
- Azul profundo como base institucional.
- Rojo para acción/competencia.
- Amarillo como acento y firma.
- Escudo con jerarquía real, no pegado decorativamente.
- Diagonales y franjas repetibles inspiradas en lenguaje deportivo.
- Tipografía condensada para titulares, dorsales y marcadores.

## Arquitectura
Los JSON productivos siguen separados en `data/`. Si están vacíos, `seed-data.js` alimenta el preview. Cuando producción entregue datos con el mismo contrato, el frontend no cambia.
