# Evidencia humana — resultados públicos / Telegram iOS

## Secuencia de evidencia recuperada

1. La primera experiencia V3 mostraba un solo partido/fecha como camino principal. Fue **RECHAZADA** porque obligaba a navegar para descubrir los demás resultados.
2. Se pidió ver **todos los resultados** en la vista principal y una **tabla/matriz visualmente alineada**.
3. PR #22 materializó la matriz global.
4. PR #23 documentó explícitamente que esa matriz **ya había sido aceptada visualmente** y sólo corrigió el solapamiento del control nativo de Telegram.
5. PR #24 conservó la misma matriz y reemplazó `<pre>` por dos líneas `<code>` de ancho fijo porque el control `</>` ensuciaba la vista en Telegram iOS.
6. La revisión actual confirma que reabrir esta decisión como DRAFT fue una regresión de autoridad de producto. La tarea vigente es restaurar el runtime aprobado, no diseñar una UX nueva.

## Requisito humano vigente

- Ver **todos los resultados verificados** como vista principal.
- Mantener una **tabla/matriz visualmente alineada**, limpia y compacta.
- Usar `<code>` inline monoespaciado y **no `<pre>`**, para evitar el control nativo de copia/código de Telegram iOS.
- Los filtros pueden existir, pero son secundarios y no reemplazan la visión global.
- `/resultados` conserva la misma semántica independientemente del bot/slot técnico.
- `📋 Resultados registrados` permanece como superficie administrativa explícita y no sustituye la consulta pública.

## Autoridad

La aceptación visual histórica de la matriz no queda anulada por una migración blue/green, un refactor arquitectónico ni un validador automatizado. Los validadores deben comprobar no-regresión contra la decisión humana ya aceptada; no pueden volver a colocarla en estado PENDING.
