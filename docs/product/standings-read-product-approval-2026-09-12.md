# STANDINGS-READ — aprobación de producto v1

Fecha: 2026-09-12
Estado: **SUPERSEDED_BY_PRESENTATION_V3**

## Qué permanece aprobado

El acceso Público de Fútbol Chépica presenta las lecturas del campeonato antes que las acciones de aporte:

- ⚽ Resultados
- 🏆 Tablas de posiciones
- 📝 Informar resultado
- 🔎 Mis aportes

La semántica deportiva permanece aprobada:

- Campeonato Principal = Tercera + Segunda + Primera.
- Jornada del Campeonato Principal = máximo 9 puntos.
- Campeonato Senior = campeonato independiente y no suma a los 9 puntos del Principal.
- Sólo resultados `VERIFIED` afectan la clasificación.
- La diferencia de gol no rompe empates oficiales.
- Las sanciones de puntos son ajustes administrativos explícitos.

## Evolución visual

La primera presentación concatenaba ambos campeonatos y ambos grupos en un solo bloque largo. La v2 separó por campeonato y grupo, pero la validación humana real detectó que esa granularidad obligaba a navegar innecesariamente por Grupo A/B y que el `<pre>` podía provocar scroll horizontal e indicador visual extraño en Telegram iOS.

## Contrato vigente

`docs/product/standings-read-telegram-presentation-contract-v3.md`

La v3 fija:

- una pantalla = un campeonato;
- Grupo A + Grupo B visibles juntos;
- sólo selector Principal / Senior;
- sin botones por grupo;
- sin `<pre>`/`<code>` ni scroll horizontal;
- edición del mismo mensaje cuando Telegram lo permita.

Estado actual: `IMPLEMENTED_PENDING_HUMAN_APPROVAL`.

La experiencia Telegram canónica continúa siendo **@FutbolChepicaBot**. El bot CUDO anterior conserva únicamente compatibilidad técnica.
