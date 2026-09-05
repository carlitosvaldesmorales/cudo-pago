# CUDO-WEB-UX-01 — GAP-02 Medición real de imágenes V8

Fecha: 2026-09-05
Estado: **MEDIDO EN CÓDIGO V8; pendiente prueba fotográfica E2E móvil**

## Evidencia del renderer/CSS actual

### Noticias
- Tarjeta normal: `.news img { width:100%; aspect-ratio:16/10; object-fit:cover; }`
- Noticia principal en home: `.home-news .news:first-child img { aspect-ratio:2/1; }`
- Consecuencia: la misma imagen puede sufrir dos recortes distintos. El requisito humano debe pedir sujeto principal centrado y área segura; no imponer resolución arbitraria todavía.

### Plantel
- Slot: `.playermedia { height:310px; }`
- Imagen: `.playermedia img { width:100%; height:100%; object-fit:cover; }`
- Grid desktop: 4 columnas; responsive debe validarse en render real.
- Consecuencia: retrato vertical/semivertical con rostro y cabeza dentro de zona segura; el recorte es cover y puede cortar bordes.

### Equipos
- V8 actual no renderiza FOTO_REF. Usa `.team-badge` gráfico CUDO.
- Consecuencia: no solicitar foto de equipo en formulario humano actual.

### Galería
- Renderer usa la imagen tanto en tarjeta como lightbox; `safeImage()` exige URL http(s) segura y el lightbox conserva `alt`.
- El contrato exacto de aspecto de `.photo img/.photoopen` debe verificarse con el CSS completo/render; no fijar restricción numérica hasta prueba.

## Resultado

GAP-02 queda parcialmente cerrado con evidencia objetiva de los slots principales. No se declara cerrado para producción hasta IMP-18/IMP-20: set de imágenes reales de iPhone/Android, render QA y capturas.

No se inventan resolución ni peso máximos.