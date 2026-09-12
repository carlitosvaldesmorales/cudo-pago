# Reglas de campeonatos y clasificación — ANFA Chépica 2026

Fecha de consolidación: 2026-09-12
Estado: FUENTE OFICIAL + ACLARACIÓN OPERATIVA DEL USUARIO

## Fuente oficial

Documento entregado por el usuario: **Bases Oficiales Campeonato 2026.pdf**, correspondiente a las bases internas del campeonato oficial de fútbol de la Asociación de Fútbol de Chépica 2026.

La base oficial establece:

- Campeonato dividido en dos grupos: uno de 6 clubes y otro de 5 clubes.
- Tercera serie: victoria 2 puntos; empate 1 punto.
- Segunda serie: victoria 3 puntos; empate 1 punto.
- Primera serie: victoria 4 puntos; empate 2 puntos.
- Sénior: victoria 3 puntos; empate 1 punto.
- En igualdad de puntos de dos o más clubes en fase regular o clasificación a liguilla, se revisa el puntaje entre los clubes y luego corresponde partido único.
- En cuartos, semifinales y finales, la igualdad se define mediante lanzamientos penales.
- Las bases contemplan pérdidas/deducciones de puntos por determinadas infracciones. Cuando la cantidad exacta no esté expresada de forma inequívoca, el sistema NO debe inventarla: debe registrarse como ajuste administrativo explícito.

## Aclaración operativa del dominio

La jornada deportiva contiene **dos campeonatos independientes** que comparten fixture físico:

### Campeonato Principal

Se compone únicamente de Tercera + Segunda + Primera.

- Tercera: máximo 2 puntos por victoria.
- Segunda: máximo 3 puntos por victoria.
- Primera: máximo 4 puntos por victoria.
- Máximo de una jornada perfecta: **9 puntos**.
- Senior nunca se suma a estos 9 puntos.

### Campeonato Senior

Senior constituye un campeonato independiente y mantiene su propia clasificación.

- Victoria Senior: 3 puntos.
- Empate Senior: 1 punto.
- Derrota Senior: 0 puntos.
- Sus puntos no alteran la clasificación del Campeonato Principal.

Sólo resultados `VERIFIED` impactan cualquiera de las dos clasificaciones.

Ejemplo ya aplicado para Unión Orilla vs San Juan, Fecha II:

- Tercera: derrota de Unión Orilla = 0.
- Segunda: victoria de Unión Orilla = 3.
- Primera: victoria de Unión Orilla = 4.
- Total de Unión Orilla en el Campeonato Principal para esa jornada = 7.
- Senior: empate = 1 punto únicamente en el Campeonato Senior.

## Regla de implementación

La clasificación se calcula por grupo y por campeonato (`PRINCIPAL` / `SENIOR`).

Orden deportivo:

1. Puntos totales del campeonato correspondiente, incluyendo ajustes administrativos explícitos.
2. Entre clubes empatados, puntaje obtenido en los enfrentamientos entre esos clubes dentro del mismo campeonato.
3. Si continúa la igualdad, el sistema NO usa diferencia de gol como desempate: marca la igualdad como pendiente de definición por partido único.

La diferencia de gol puede exponerse únicamente como estadística informativa; no decide posiciones.

## Sanciones / ajustes

Las sanciones que afecten puntos se registran en `standings_adjustments`, indicando explícitamente:

- club;
- campeonato afectado (`PRINCIPAL` o `SENIOR`);
- delta de puntos;
- motivo;
- fuente/autoridad;
- fecha efectiva;
- trazabilidad temporal.

Esto permite aplicar una pérdida o descuento de puntos sin modificar marcadores históricos, sin mezclar ambos campeonatos y sin inventar cantidades no definidas por la fuente.
