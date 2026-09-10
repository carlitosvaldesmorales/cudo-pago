# TELEGRAM-PUBLIC-RESULTS-UX-V2

Fecha: 2026-09-10
Estado: **PRODUCCIÓN PASS / BLOQUEADO EN E2E VISUAL iOS**

## Problema observado

La vista pública de resultados funcionaba técnicamente, pero entregaba una lista larga tipo reporte (`RESULTADOS REGISTRADOS`) que obligaba a recorrer muchos resultados en una sola pantalla de Telegram.

La captura humana del nuevo bot confirmó que la información era correcta, pero la experiencia no era suficientemente fluida para consulta móvil.

Clasificación previa:

- funcionalidad: PASS;
- integridad de datos: PASS;
- UX pública móvil: NO ACEPTADA.

## Decisión de UX

Aplicar divulgación progresiva sólo en el bot destino `@FutbolChepicaBot` durante la convivencia blue/green.

No se modifica:

- D1;
- resultados oficiales;
- RBAC;
- gobierno de resultados;
- bot rollback `@CUDODeportesBot`.

Nuevo flujo:

```text
RESULTADOS OFICIALES
├── Última fecha con resultados
│   └── Partido
│       └── 3ª / 2ª / Senior / 1ª
├── Por fecha
│   └── Partido
│       └── Series
├── Por club
│   └── Fecha / rival
│       └── Series
└── Por serie
    └── Fecha
        └── partidos de esa serie
```

## Implementación

Nuevo módulo:

- `sports-bus/worker/public-results-ux-v2.js`

El wrapper blue/green `sports-bus/telegram-migration-entry.js` intercepta en el bot destino únicamente:

- `tp:public-results`;
- callbacks `px:*` del nuevo navegador público.

Todo otro update continúa hacia el core existente.

El bot antiguo mantiene el flujo heredado. Esto permite comparar experiencia nueva/antigua y conserva rollback inmediato.

## Presentación

Entrada pública nueva:

```text
⚽ RESULTADOS OFICIALES

Consulta de forma rápida por fecha, club o serie.

[🆕 Fecha II · última con resultados]
[📅 Por fecha] [🏟 Por club]
[🏆 Por serie]
[🌐 Volver a Público]
```

Una fecha ya no imprime todos los resultados. Primero presenta los partidos y cuántas series oficiales tienen resultado (`4/4`).

El detalle de partido muestra una tarjeta compacta:

```text
⚽ FECHA II · Grupo A
🏟 Unión Orilla vs San Juan

3ª      2 — 3
2ª      1 — 0
Senior  0 — 0
1ª      3 — 0

✅ Resultados verificados
```

## Seguridad

El handler V2 valida el `x-telegram-bot-api-secret-token` antes de realizar llamadas a Telegram. No crea ni modifica resultados; sólo consulta filas `validation_status='VERIFIED'`.

## QA automatizado

Harness:

- `qa/telegram/public-results-ux-v2-harness.mjs`

Demuestra:

- el bot destino reemplaza el dump largo por navegación progresiva;
- última fecha detecta la fecha más reciente con resultados verificados;
- detalle de partido muestra las cuatro series compactas;
- navegación por club funciona;
- navegación por serie/fecha funciona;
- el bot rollback conserva la presentación heredada;
- un webhook secret inválido se rechaza antes de efectos laterales;
- ningún request de QA puede salir a hosts arbitrarios.

PR #17 pasó los tres gates antes del merge:

- Validate Telegram QA Harness: PASS;
- Validate Result Governance: PASS;
- Validate Public Result Submission: PASS.

También continúan PASS:

- G1 / Telegram base;
- native menu;
- blue/green migration;
- aislamiento de caché entre bots.

## Evidencia de producción

PR #17 fue fusionado a `feature/sports-event-bus-v1` con merge `9f06a71c841322229c40fe386f1146f46482cddf`.

### Deploy #56

El Worker V2 sí se desplegó, pero el workflow falló después en el reconcile del bot primario. La versión desplegada fue `0fabe79a-40e0-45ad-be7b-2ac26d3366f6` y la validación D1 previa pasó con:

- 25 partidos;
- 5 byes;
- 11 equipos;
- 24 series VERIFIED;
- 6 partidos con resultados;
- estados/versiones inválidos = 0;
- `missing_current_version = 0`.

El reconcile primario devolvió HTTP 502 durante los intentos. Ese hecho NO demuestra por sí solo una causa de Telegram porque el workflow antiguo ocultaba el cuerpo de la respuesta al usar `curl -f`.

### Corrección operativa del deploy

PR #18 cambió el patrón a **health-first / reconcile-on-drift**:

1. consultar health;
2. si el estado deseado ya está sano, no ejecutar escrituras Bot API;
3. reconciliar sólo si health demuestra drift de configuración;
4. si se reconcilia y falla, imprimir HTTP status + response body;
5. para el bot destino, exigir además `public_results_ux_version=2`.

Esto evita ejecutar `setWebhook`, `setChatMenuButton`, `setMyCommands` y `setMyName` en cada despliegue sin necesidad.

### Deploy #57

Deploy #57, run `34434511684`, terminó **SUCCESS completo**.

El primer health del bot primario devolvió HTTP 200:

- `bot_id = 8209002627`;
- `bot_username = CUDODeportesBot`;
- `bot_name = Fútbol Chépica`;
- webhook/menu/default commands = PASS;
- `pending_update_count = 0`.

Por estar sano, el pipeline registró explícitamente: `Primary Telegram configuration already healthy; no Bot API writes required.`

El bot destino también devolvió HTTP 200 en el primer intento:

- `bot_id = 8979834638`;
- `bot_username = FutbolChepicaBot`;
- `bot_name = Fútbol Chépica`;
- webhook/menu/default commands = PASS;
- `public_results_ux_version = 2`;
- `pending_update_count = 0`;
- `last_error_date = null`;
- `last_error_message = null`.

El pipeline registró: `Destination Telegram configuration already healthy; no Bot API writes required.` y finalmente `Destination bot is healthy on shared Worker/D1 and public_results_ux_version=2 is live.`

Los datos deportivos volvieron a validar sin regresión antes del deploy.

## Gates

### U1 — Diseño

- [x] problema identificado con evidencia visual real;
- [x] arquitectura sin duplicar backend;
- [x] navegación por fecha;
- [x] navegación por club;
- [x] navegación por serie;
- [x] detalle compacto por partido.

### U2 — QA

- [x] sintaxis;
- [x] harness V2;
- [x] regresiones Telegram;
- [x] rollback bot antiguo sin cambios;
- [x] seguridad webhook.

### U3 — Producción

- [x] merge a `feature/sports-event-bus-v1`;
- [x] deploy Worker SUCCESS (#57);
- [x] `/health/telegram-next` runtime PASS;
- [x] `public_results_ux_version = 2`;
- [x] datos deportivos sin regresión;
- [x] bot primario conservado sano como rollback.

### U4 — E2E humano

- [ ] abrir `@FutbolChepicaBot` → Vista pública → Resultados verificados;
- [ ] visualizar home `RESULTADOS OFICIALES` sin dump largo;
- [ ] probar `Última fecha`;
- [ ] abrir un partido y comprobar tarjeta de 4 series;
- [ ] validar en iOS que el flujo se siente navegable.

## Primer bloqueo actual

U1, U2 y U3 están cerrados con código, QA y runtime productivo.

El primer bloqueo real ahora es visual/humano: la automatización puede demostrar consultas, callbacks, seguridad y contrato desplegado, pero no puede certificar cómo se percibe finalmente la interacción en Telegram iOS.
