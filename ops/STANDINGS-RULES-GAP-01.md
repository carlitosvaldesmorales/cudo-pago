# STANDINGS-RULES-GAP-01

Fecha de apertura: 2026-09-10
Fecha de resolución: 2026-09-12
Estado: **RESUELTO**

## Qué desbloqueó el GAP

El usuario entregó `Bases Oficiales Campeonato 2026.pdf`, correspondiente a las bases internas del campeonato oficial de fútbol de la Asociación de Fútbol de Chépica 2026, y aclaró el límite competitivo entre Campeonato Principal y Campeonato Senior.

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

### Aclaración operativa del dominio

- **Campeonato Principal** = Tercera + Segunda + Primera.
- Una jornada perfecta del Campeonato Principal suma **9 puntos máximo**: 2 + 3 + 4.
- **Campeonato Senior** = campeonato independiente, con su propia clasificación.
- Senior nunca suma a los 9 puntos del Campeonato Principal.
- Derrota = 0 puntos en el campeonato correspondiente.
- Sólo resultados `VERIFIED` impactan las clasificaciones.

Ejemplo ya aplicado: Unión Orilla vs San Juan, Fecha II: derrota en Tercera = 0, victoria en Segunda = 3 y victoria en Primera = 4; total Campeonato Principal = 7. Empate Senior = 1 punto únicamente en Campeonato Senior.

## Regla de desempate implementable

Dentro de cada campeonato, de forma independiente:

1. Puntos totales.
2. Puntaje entre los clubes empatados.
3. Si persiste igualdad, NO usar diferencia de gol: marcar definición pendiente por partido único.

La diferencia de gol puede mostrarse como estadística, pero no ordenar deportivamente la clasificación.

## Sanciones

Las bases contienen casos de pérdida/deducción de puntos, pero no todas las cantidades quedan determinadas de forma inequívoca. Por ello las sanciones se modelan como ajustes administrativos explícitos en `standings_adjustments`, con trazabilidad de club, `championship_code` (`PRINCIPAL` o `SENIOR`), delta, motivo, fuente y fecha. El motor nunca inventa una deducción ni modifica marcadores históricos para representar una sanción.

## Implementación asociada

- `sports-bus/worker/competition-domain.js`
- `sports-bus/worker/public-standings-entry.js`
- `sports-bus/migrations/0023_standings_adjustments.sql`
- `sports-bus/migrations/0024_standings_championship_boundary.sql`
- `docs/architecture/competition-domain-adn-v2.md`
- API: `GET /api/v1/public-standings`
- Telegram: `Público -> Tablas de posiciones`

El bloqueo normativo de cálculo base queda cerrado. La clasificación ya no se modela como dos tablas de una misma competencia, sino como dos campeonatos independientes que comparten jornada física.
