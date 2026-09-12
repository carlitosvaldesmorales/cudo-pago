# STANDINGS-READ — contrato de presentación Telegram v2

Fecha: 2026-09-12
Estado: **SUPERSEDED_BY_V3**
Canal canónico: **@FutbolChepicaBot**

## Motivo de supersesión

La v2 resolvió el bloque gigante de texto y agregó Presentation Model + renderer, pero la validación humana en Telegram iOS detectó dos problemas reales:

- obligaba a navegar Grupo A / Grupo B con botones cuando la intención era ver ambos grupos del mismo campeonato en una sola vista;
- el bloque `<pre>` generó overflow horizontal e indicador visual extraño de Telegram.

Por ello la v2 deja de ser el contrato vigente.

## Contrato vigente

`docs/product/standings-read-telegram-presentation-contract-v3.md`

La semántica deportiva no cambia: Principal y Senior siguen siendo campeonatos independientes, con Principal = 3ª + 2ª + 1ª y máximo 9 puntos por jornada.
