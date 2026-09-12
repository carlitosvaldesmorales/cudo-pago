# RESULTS-READ · Restauración de aprobación de producto

Fecha: 2026-09-11
Estado: **APROBACIÓN PREVIA RECUPERADA / NO ES REDISEÑO NUEVO**

## Motivo

La revisión de Telegram del 2026-09-11 mostró `📋 RESULTADOS REGISTRADOS` al usar `/resultados`. Esa pantalla ya había sido identificada y corregida anteriormente como una ruta administrativa que no debía reemplazar la experiencia pública de consulta.

La decisión de producto NO estaba pendiente. Fue tratada erróneamente como DRAFT en PR #65/#66.

## Evidencia histórica recuperada

- PR #21 `Telegram: aclarar /resultados en bot destino`: documentó exactamente la confusión `📋 RESULTADOS REGISTRADOS` y normalizó `/resultados` hacia la vista pública, manteniendo el registro administrativo detrás del botón explícito del portal.
- PR #22 `Telegram: mostrar todos los resultados en matriz alineada`: fijó como objetivo humano ver todos los resultados verificados en la vista principal, sin drilldown obligatorio partido por partido; buscar/filtrar queda como acción secundaria.
- PR #23 declara explícitamente que conserva **la matriz que fue aceptada visualmente**.
- PR #24 conserva esa misma matriz y reemplaza `<pre>` por dos líneas `<code>` para eliminar el control nativo `</>` de Telegram iOS sin cambiar datos, orden, navegación ni comportamiento.

## Contrato recuperado

Para `RESULTS-READ` en Telegram:

1. `/resultados` y `Resultados verificados` representan la capacidad canónica de consultar resultados.
2. La primera vista muestra los resultados VERIFIED disponibles agrupados por fecha y partido.
3. Cada partido muestra las cuatro series en una matriz compacta y legible.
4. No existe drilldown obligatorio para poder ver el resultado.
5. `Buscar / filtrar` es secundario y permite navegar por fecha, club o serie.
6. `📋 Resultados registrados` es una superficie administrativa contextual y se mantiene detrás de su acceso explícito `tp:registered`; no redefine `/resultados`.
7. La misma semántica aplica independientemente del slot/bot técnico. Un mecanismo blue/green no puede cambiar el significado humano del comando.

## Regresión observada

El harness heredado de PR #21 preservó deliberadamente la divergencia blue/green: `NEXT /resultados` → vista pública, pero `PRIMARY /resultados` → listado administrativo. Esa excepción era útil durante la migración, pero quedó convertida accidentalmente en comportamiento permanente mientras ambos bots comparten nombre visible `Fútbol Chépica`.

La corrección actual elimina esa divergencia semántica. El slot técnico deja de decidir qué significa `/resultados`.

## Regla de no regresión

**BOT/SLOT ≠ SEMÁNTICA DE LA CAPACIDAD**

`/resultados` debe significar `RESULTS-READ` en cualquier adapter Telegram activo. Las vistas administrativas se exponen mediante acciones administrativas explícitas, no reutilizando el mismo comando con otro significado.
