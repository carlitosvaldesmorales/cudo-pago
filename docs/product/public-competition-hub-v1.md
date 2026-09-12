# PUBLIC COMPETITION HUB v1

Fecha: 2026-09-12
Producto: Fútbol Chépica
Estado: IMPLEMENTADO HASTA GAP NORMATIVO DE STANDINGS

## Intención humana

Una persona que entra a `Público` quiere primero consultar el campeonato. Las acciones de aporte son secundarias.

## Patrón

`Competition Hub / Match Center` con proyecciones de lectura sobre una misma autoridad de datos.

La navegación pública canónica queda:

1. `⚽ Resultados`
2. `🏆 Tabla de posiciones`
3. `📝 Informar resultado`
4. `🔎 Mis aportes`
5. `🏠 Volver`

## Invariantes

- `Público` organiza la experiencia por intención humana, no por tablas, endpoints ni callbacks.
- `Resultados` reutiliza la capacidad canónica `RESULTS-READ`; no crea una copia.
- `Tabla de posiciones` es una proyección distinta de los mismos resultados oficiales, no una segunda autoridad.
- Ningún aporte `SUBMITTED/PENDIENTE` puede afectar una tabla pública.
- Una tabla sólo puede calcularse desde resultados oficiales/publicables (`VERIFIED`) y reglas normativas explícitas.
- Mientras falte la fuente normativa, el botón de tabla debe fallar cerrado y explicar el GAP; nunca inventar 3/1/0, desempates, ponderaciones, WO ni sanciones.
- Telegram es sólo un adaptador de presentación. La futura proyección de standings debe poder ser reutilizada por Web/API sin cambiar su semántica.

## Estado actual

`RESULTS-READ` ya es consumible y conserva su UX aprobada.

`STANDINGS-READ` no se materializa todavía como cálculo porque el repositorio mantiene el GAP `ops/STANDINGS-RULES-GAP-01.md`.

El Hub sí se materializa ahora: la tabla aparece como intención pública principal, pero responde de forma explícita que aún no se publica hasta incorporar la regla oficial del Campeonato ANFA Chépica 2026.

## Condición de desbloqueo

Incorporar una fuente autorizada que defina, como mínimo:

- estructura de clasificación (por serie o acumulada por club);
- puntaje por victoria/empate/derrota para cada serie;
- orden completo de desempates;
- WO/no presentación y marcador reglamentario;
- sanciones o descuentos de puntos;
- tratamiento de `DISPUTED`;
- tratamiento de `ANNULLED`;
- cualquier ponderación, bonificación o regla especial.

Después del desbloqueo:

`match_series_results VERIFIED -> motor determinista de standings -> API/read model -> Telegram + Web`
