# Evidencia humana — Telegram resultados V2

Fecha: 2026-09-10
Canal: Telegram iOS
Bot destino: `@FutbolChepicaBot`

## Hechos observados

- La vista V2 está desplegada y funcional.
- La navegación pública ofrece: última fecha con resultados, por fecha, por club y por serie.
- Al seleccionar `Por fecha`, Telegram agrega un nuevo mensaje/panel con selector de fechas.
- Al seleccionar una fecha, Telegram agrega otro mensaje/panel con la lista de partidos.
- En la misma pantalla quedan visibles paneles anteriores y sus botones.
- Cada partido completo muestra el sufijo `4/4`.
- El menú nativo de Telegram permanece disponible en la parte inferior.

## Feedback humano explícito

> “Ahora siento que es más carga cognitiva”.

## Estado

- Integridad de datos: PASS.
- Flujo funcional: PASS.
- Aceptación UX: RECHAZADA / pendiente de rediseño validado independientemente.

## Restricción

No asumir la solución. En particular, no convertir automáticamente en decisión ninguna hipótesis previa como “usar un solo mensaje mutable”, “mostrar la última fecha por defecto” o “eliminar filtros”. El validador debe evaluar el problema y proponer principios/cambios con evidencia.