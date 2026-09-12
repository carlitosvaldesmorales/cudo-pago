# STANDINGS-READ — aprobación de producto

Fecha: 2026-09-12
Estado: APPROVED

## Intención aprobada

El acceso Público de Fútbol Chépica debe presentar las lecturas del campeonato antes que las acciones de aporte:

- ⚽ Resultados
- 🏆 Tablas de posiciones
- 📝 Informar resultado
- 🔎 Mis aportes

El usuario aprobó implementar este patrón como Competition Hub y luego aclaró el límite competitivo que debe quedar en la lógica y en el ADN:

- Campeonato Principal = Tercera + Segunda + Primera.
- Jornada del Campeonato Principal = máximo 9 puntos.
- Campeonato Senior = campeonato independiente y no suma a los 9 puntos del Principal.

## Contrato visual aprobado

La proyección de tablas debe distinguir explícitamente, y no sólo mediante cálculo interno:

```text
🏆 CAMPEONATOS · ANFA CHÉPICA 2026

⚽ CAMPEONATO PRINCIPAL
3ª + 2ª + 1ª · máximo 9 puntos por jornada
[clasificación por grupo]

👴 CAMPEONATO SENIOR · INDEPENDIENTE
Senior tiene su propia clasificación y no suma a los 9 puntos del Campeonato Principal.
[clasificación por grupo]
```

No se deben mezclar ambas clasificaciones ni presentar Senior como una cuarta serie que eleve el máximo del Campeonato Principal a 12 puntos.

## Autoridad

- Sólo resultados `VERIFIED` afectan las clasificaciones.
- La diferencia de gol no rompe empates oficiales.
- Las sanciones de puntos son ajustes administrativos explícitos al campeonato correspondiente.

## Canal

La experiencia Telegram canónica de este contrato es **@FutbolChepicaBot**. El bot CUDO anterior puede conservar compatibilidad técnica, pero no es la identidad canónica para nuevos cambios de producto.
