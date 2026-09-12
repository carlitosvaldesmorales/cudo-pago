# RESULTS-READ · Contrato visual canónico v1

Estado: **DRAFT / REQUIERE VALIDACIÓN DE PRODUCTO**
Módulo: `RESULTS-READ`
Objetivo humano: **consultar rápidamente los resultados publicados del campeonato sin interpretar estados internos ni escribir texto**.

## Principio

El módulo es uno. Público, dirigente, Chépica Play, operador y administrador consumen la misma semántica. Actor, canal o tenant no crean otro módulo.

Los canales pueden adaptar la presentación a su espacio, pero deben conservar la misma jerarquía de información y la misma verdad pública.

## Golden Path humano

```text
⚽ RESULTADOS
      ↓
📅 Fecha más reciente con información publicable
      ↓
[🏟 Club A vs Club B]
[🏟 Club C vs Club D]
[🏟 Club E vs Club F]
      ↓
seleccionar partido
      ↓
⚽ FECHA 3 · GRUPO A
🏟 Club A vs Club B

3ª       2 — 1   ✅ Oficial
2ª       —       Pendiente
Senior   —       En revisión
1ª       1 — 1   ✅ Oficial

[⬅️ Fecha 3]   [🔎 Buscar]
```

No se muestra un marcador cuando el estado no autoriza publicarlo.

## Navegación alternativa

Desde `🔎 Buscar`:

```text
🔎 OTROS RESULTADOS

[📅 Por fecha]   [🏟 Por club]
[🏆 Por serie]
[⬅️ Última fecha]
```

Todo se selecciona con botones. No se exige escribir nombres de clubes, fechas ni series.

## Estados visibles

La representación humana debe distinguir como mínimo:

- `OFFICIAL` → marcador visible + `✅ Oficial`;
- `PENDING` → sin marcador + `Pendiente`;
- `IN_REVIEW` → sin marcador + `En revisión`;
- `ANNULLED` → sin marcador + `Anulado`.

Un estado interno nunca debe obligar al usuario a conocer nombres de tablas, workflows o mecanismos de gobernanza.

## Contrato semántico entre canales

### Telegram

- botón `⚽ Resultados` abre directamente la fecha más reciente con información publicable;
- partidos se eligen mediante botones;
- detalle muestra las cuatro series siempre en orden `3ª → 2ª → Senior → 1ª`;
- búsqueda por fecha, club o serie sólo mediante selección.

### Web

- puede mostrar varios partidos simultáneamente en tarjetas;
- cada tarjeta mantiene las cuatro series en el mismo orden;
- los mismos estados y reglas de visibilidad de marcador aplican;
- filtros/fechas/grupos son proyecciones de la misma capacidad, no otra fuente de verdad.

### API / Streaming

Son contratos de máquina/proyecciones de `RESULTS-READ`; no definen una UX humana separada y no cambian la autoridad del dato.

## Carga cognitiva

Reglas obligatorias:

1. fecha más útil primero;
2. botones antes que escritura libre;
3. partido y serie siempre identificables;
4. marcador oficial inequívoco;
5. estados no oficiales nunca parecen resultado oficial;
6. máximo una decisión principal por pantalla de Telegram;
7. volver/buscar siempre visible cuando corresponda.

## Errores / vacíos

Sin resultados publicables:

```text
⚽ RESULTADOS

Todavía no hay resultados publicados para esta selección.

[📅 Otras fechas]
[🔎 Buscar]
[🏠 Inicio]
```

Un error técnico se comunica como indisponibilidad temporal; nunca se rellena con un marcador inferido.

## No incluido

- registrar resultados (`RESULTS-REGISTER`);
- gobernar/corregir resultados (`RESULTS-GOVERN`);
- tabla de posiciones;
- eventos en vivo del partido;
- lógica específica de OBS/vMix.

## Gate

Este documento NO autoriza todavía cambios al runtime protegido de `RESULTS-READ`.

Para avanzar a `PRODUCT_VALIDATED` se necesita validar visualmente este contrato como experiencia humana canónica. Después, los runtimes existentes de Telegram/Web se alinean contra él y MOF+ certifica el mismo módulo con sus distintas proyecciones.
