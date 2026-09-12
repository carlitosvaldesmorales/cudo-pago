# ADN de dominio — Campeonatos ANFA Chépica 2026

Estado: CANÓNICO
Fecha: 2026-09-12

## Invariantes

`CAMPEONATO_PRINCIPAL_MAX_9_PUNTOS_POR_JORNADA`

El Campeonato Principal se compone exclusivamente de:

- Tercera: victoria 2, empate 1, derrota 0.
- Segunda: victoria 3, empate 1, derrota 0.
- Primera: victoria 4, empate 2, derrota 0.

Una jornada perfecta del Campeonato Principal suma como máximo **9 puntos**: 2 + 3 + 4.

`SENIOR_ES_CAMPEONATO_INDEPENDIENTE`

Senior no forma parte de los 9 puntos del Campeonato Principal. Senior constituye un campeonato independiente con su propia clasificación:

- Senior: victoria 3, empate 1, derrota 0.

Una victoria Senior suma 3 puntos únicamente al Campeonato Senior y nunca eleva una jornada del Campeonato Principal de 9 a 12 puntos.

## Modelo

La jornada deportiva comparte el mismo fixture físico, pero contiene dos autoridades competitivas distintas:

```text
JORNADA / PARTIDO
├── CAMPEONATO PRINCIPAL
│   ├── Tercera
│   ├── Segunda
│   └── Primera
│       máximo 9 pts/jornada
└── CAMPEONATO SENIOR
    └── Senior
        campeonato independiente
```

## Proyecciones

Las tablas públicas son proyecciones independientes de los mismos resultados `VERIFIED`:

- `PRINCIPAL`: suma sólo Tercera + Segunda + Primera.
- `SENIOR`: suma sólo Senior.

Las sanciones o ajustes de puntos deben indicar explícitamente qué campeonato afectan mediante `championship_code`. No se modifica un marcador histórico para representar una sanción.

## Desempate

1. puntos totales del campeonato correspondiente;
2. puntaje obtenido entre los clubes empatados dentro de ese mismo campeonato;
3. si persiste la igualdad, queda pendiente la definición por partido único.

La diferencia de gol puede mostrarse como estadística, pero no rompe el empate deportivo.

## Regla arquitectónica

`SHARED_FIXTURE_NEQ_SHARED_STANDINGS`

Compartir partido, fecha, cancha o registro de marcador no convierte dos campeonatos en una sola clasificación.
