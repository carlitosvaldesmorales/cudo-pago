# RESULTS-READ · Contrato visual canónico v1

Estado: **APPROVED / APROBACIÓN PREVIA RECUPERADA**
Módulo: `RESULTS-READ`
Objetivo humano: **ver rápidamente los resultados verificados del campeonato sin navegar partido por partido para descubrirlos**.

## Fuente de decisión

Este contrato no es un rediseño nuevo. Recupera la decisión ya materializada y validada visualmente en PR #21, #22, #23 y #24. La evidencia de restauración está en `docs/product/results-read-product-approval-restore-2026-09-11.md`.

## Principio

`RESULTS-READ` es una capacidad canónica. Actor, rol, bot, slot, canal o tenant no cambian su significado.

La HMI puede adaptar contexto y accesos secundarios, pero no puede cambiar la semántica de `/resultados` ni ocultar la vista pública detrás de una superficie administrativa.

## Telegram · vista principal aprobada

La primera vista muestra **todos los resultados VERIFIED disponibles**, agrupados por fecha y partido, sin drilldown obligatorio.

Patrón aprobado:

```text
⚽ RESULTADOS OFICIALES

📅 FECHA II
🏟 Unión Orilla — San Juan
3ª  2–3    2ª  1–0
S   0–0    1ª  3–0

📅 FECHA I
🏟 Santa Elena La Ruda — Unión Orilla
3ª  1–0    2ª  2–1
S   0–2    1ª  1–2

[🔎 Buscar / filtrar]   [🌐 Público]
```

La matriz usa texto monoespaciado inline (`<code>`), no bloques `<pre>`, para evitar el control nativo `</>` observado en Telegram iOS.

## Navegación secundaria

`🔎 Buscar / filtrar` es una acción secundaria. Puede ofrecer:

```text
[📅 Por fecha]   [🏟 Por club]
[🏆 Por serie]
[⬅️ Volver]
```

La búsqueda no reemplaza la vista principal ni obliga a navegar partido por partido para conocer los resultados.

## Semántica de comandos y accesos

- `/resultados` → `RESULTS-READ` público/canónico.
- `Resultados verificados` → misma capacidad `RESULTS-READ`.
- `📋 Resultados registrados` → superficie administrativa contextual distinta, accesible por acción explícita dentro de Dirigentes/Admin (`tp:registered`).
- Un bot o slot blue/green no puede reasignar `/resultados` a otra semántica.

## Estados y publicación

La vista principal sólo publica marcadores `VERIFIED`.

- resultado VERIFIED → marcador visible;
- pendiente, disputado, anulado o no publicable → no debe presentarse como marcador oficial en esta vista;
- la ausencia de un marcador nunca se rellena por inferencia.

Los estados operativos detallados pertenecen a gobierno/administración y no contaminan la vista pública principal.

## Contrato entre canales

### Telegram

Matriz compacta de resultados verificados + búsqueda secundaria.

### Web

Puede usar tarjetas, tablas u otra HMI adecuada al navegador, siempre proyectando la misma autoridad canónica y las mismas reglas de publicación.

### API / Streaming

Son proyecciones de máquina de la misma capacidad/estado. No crean otra verdad ni obligan a copiar el modelo Telegram.

## Invariantes de carga cognitiva

1. resultados visibles de inmediato;
2. no drilldown obligatorio para descubrir resultados;
3. agrupación clara por fecha y partido;
4. cuatro series compactas por partido cuando están verificadas;
5. filtros como opción secundaria;
6. sin jerga técnica interna;
7. mismo significado de `/resultados` en cualquier adapter Telegram activo.

## No incluido

- registrar resultados (`RESULTS-REGISTER`);
- gobernar/corregir resultados (`RESULTS-GOVERN`);
- tabla de posiciones;
- eventos en vivo;
- lógica específica de OBS/vMix.

## Gate

La aprobación visual no está pendiente: fue recuperada de la historia del producto. El trabajo pendiente es **restaurar y certificar el runtime contra este contrato**, no rediseñarlo.
