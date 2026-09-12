# STANDINGS-RULES-GAP-01

Fecha de apertura: 2026-09-10
Fecha de resolución: 2026-09-12
Estado: **RESUELTO**

## Qué desbloqueó el GAP

El usuario entregó `Bases Oficiales Campeonato 2026.pdf`, correspondiente a las bases internas del campeonato oficial de fútbol de la Asociación de Fútbol de Chépica 2026, y se recuperó la aclaración operativa previamente definida para la estructura de tablas.

## Reglas confirmadas

### Fuente oficial 2026

- Campeonato dividido en dos grupos: uno de 6 clubes y uno de 5 clubes.
- Tercera: victoria 2 puntos; empate 1 punto.
- Segunda: victoria 3 puntos; empate 1 punto.
- Primera: victoria 4 puntos; empate 2 puntos.
- Senior: victoria 3 puntos; empate 1 punto.
- En igualdad de puntos de dos o más clubes en fase regular o clasificación a liguilla, se revisa el puntaje entre los clubes y luego corresponde partido único.
- En cuartos, semifinales y finales la igualdad se define mediante lanzamientos penales.
- Existen sanciones que pueden provocar pérdida/deducción de puntos.

### Aclaración operativa ya entregada por el usuario

- Tabla General = Tercera + Segunda + Primera.
- Tabla Senior = Senior separada.
- Derrota = 0 puntos.
- Sólo resultados `VERIFIED` impactan la clasificación.

Ejemplo previo ya aplicado: Unión Orilla vs San Juan, Fecha II: derrota en Tercera = 0, victoria en Segunda = 3 y victoria en Primera = 4; total Tabla General = 7. Empate Senior = 1 punto en Tabla Senior.

## Regla de desempate implementable

1. Puntos totales.
2. Puntaje entre los clubes empatados.
3. Si persiste igualdad, NO usar diferencia de gol: marcar definición pendiente por partido único.

La diferencia de gol puede mostrarse como estadística, pero no ordenar deportivamente la tabla.

## Sanciones

Las bases contienen casos de pérdida/deducción de puntos, pero no todas las cantidades quedan determinadas de forma inequívoca. Por ello las sanciones se modelan como ajustes administrativos explícitos en `standings_adjustments`, con trazabilidad de club, tabla, delta, motivo, fuente y fecha. El motor nunca inventa una deducción.

## Implementación asociada

- `sports-bus/worker/public-standings-entry.js`
- `sports-bus/migrations/0023_standings_adjustments.sql`
- API: `GET /api/v1/public-standings`
- Telegram: `Público -> Tabla de posiciones`

El bloqueo normativo de cálculo base queda cerrado.
