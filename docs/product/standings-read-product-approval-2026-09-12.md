# STANDINGS-READ — aprobación de producto v1

Fecha: 2026-09-12
Estado: **SUPERSEDED_BY_PRESENTATION_V2**

## Qué permanece aprobado

El acceso Público de Fútbol Chépica presenta las lecturas del campeonato antes que las acciones de aporte:

- ⚽ Resultados
- 🏆 Tablas de posiciones
- 📝 Informar resultado
- 🔎 Mis aportes

La semántica deportiva también permanece aprobada:

- Campeonato Principal = Tercera + Segunda + Primera.
- Jornada del Campeonato Principal = máximo 9 puntos.
- Campeonato Senior = campeonato independiente y no suma a los 9 puntos del Principal.
- Sólo resultados `VERIFIED` afectan la clasificación.
- La diferencia de gol no rompe empates oficiales.
- Las sanciones de puntos son ajustes administrativos explícitos.

## Qué queda supersedido

La presentación visual que concatenaba:

- Campeonato Principal;
- Grupo A;
- Grupo B;
- Campeonato Senior;
- Grupo A;
- Grupo B;

en un único mensaje de Telegram fue revisada en runtime real y rechazada por el usuario por falta de formato y jerarquía.

Por lo tanto, esa disposición deja de ser un contrato visual aprobado.

## Contrato vigente

La presentación vigente pasa a:

`docs/product/standings-read-telegram-presentation-contract-v2.md`

Estado actual del contrato v2: `IMPLEMENTED_PENDING_HUMAN_APPROVAL`.

La experiencia Telegram canónica continúa siendo **@FutbolChepicaBot**. El bot CUDO anterior conserva únicamente compatibilidad técnica.
