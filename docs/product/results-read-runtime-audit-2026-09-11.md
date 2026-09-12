# RESULTS-READ · Runtime audit 2026-09-11

Estado: **EVIDENCIA CAPTURADA / CONTRATO AÚN PENDIENTE DE VALIDACIÓN HUMANA**

## Evidencia humana

Captura de Telegram compartida por el usuario el 2026-09-11 a las 23:50 (Chile) después de ejecutar `/resultados` en el bot **Fútbol Chépica**.

La pantalla observada muestra:

```text
📋 RESULTADOS REGISTRADOS

Fecha II · PRIMERA
Unión Orilla 3-0 San Juan

Fecha II · SEGUNDA
Unión Orilla 1-0 San Juan

...
```

La respuesta continúa como una lista extensa de resultados en texto, obligando a desplazarse y leer secuencialmente múltiples fechas, partidos y series.

## Trazabilidad al runtime

La salida observada coincide exactamente con la rama `command==='resultados'` de:

- `sports-bus/worker/telegram-native-menu-entry.js`

Ese handler consulta resultados `VERIFIED`, concatena cada serie como líneas de texto y responde bajo el título `📋 RESULTADOS REGISTRADOS`.

Existe además otra implementación de la misma intención en:

- `sports-bus/worker/public-results-table-view.js`

que agrupa todos los resultados oficiales en una tabla/lista grande y agrega botones de filtro.

Y una tercera implementación en:

- `sports-bus/worker/public-results-ux-v3.js`

que parte desde la fecha útil y permite navegar por partido, fecha, club o serie con botones.

## Hallazgo estructural

La captura no revela sólo un problema estético. Revela una duplicación de producto:

```text
MISMA INTENCIÓN: consultar resultados

/resultados admin/dirigente ──> listado largo
 tp:public-results table  ────> tabla/listado largo
 public-results-ux-v3     ────> navegación button-first
```

Esto viola:

- `ACTOR_NEQ_MODULE`;
- `CHANNEL_NEQ_MODULE`;
- `SAME_INTENT_SAME_SEMANTICS_ONE_CANONICAL_CAPABILITY`;
- `REFERENCE_OVER_COPY`.

La diferencia de actor puede modificar `scope` o permisos, pero no debe crear una UX distinta para la misma intención de lectura.

## Evaluación contra el contrato DRAFT

La pantalla observada **NO CONFORMA** con `docs/product/results-read-visual-contract-v1.md` porque:

1. no presenta una sola decisión principal por pantalla;
2. no abre sobre una fecha útil con partidos seleccionables;
3. obliga a leer una lista extensa;
4. mezcla múltiples fechas y series en el mismo mensaje;
5. no usa selección por botones como mecanismo principal;
6. el actor administrativo recibe una experiencia distinta para la misma intención humana.

## Patrón propuesto para validación

Sin importar si el consumidor es público, dirigente, Chépica Play, operador o administrador:

```text
⚽ RESULTADOS
📅 Fecha más reciente con información publicable

[🏟 Partido 1]
[🏟 Partido 2]
[🏟 Partido 3]

[🔎 Buscar]
```

Al elegir partido:

```text
⚽ FECHA N · GRUPO X
🏟 Local vs Visita

3ª       marcador/estado
2ª       marcador/estado
Senior   marcador/estado
1ª       marcador/estado

[⬅️ Fecha N]   [🔎 Buscar]
```

La política del actor puede limitar qué partidos/fechas puede consultar si existiera una razón de negocio explícita, pero no cambia la estructura cognitiva del módulo.

## Gate

No se modifica todavía el runtime protegido de `RESULTS-READ`.

La siguiente acción requiere aprobación humana del contrato visual canónico. Después de esa aprobación corresponde:

1. eliminar la duplicación funcional de `/resultados`;
2. hacer que todas las entradas de `RESULTS-READ` lleguen al mismo flujo canónico;
3. conservar actor/scope sólo como policy;
4. ejecutar MOF+ sintético y visual;
5. desplegar y volver a certificar en Telegram real.
