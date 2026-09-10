# TELEGRAM-PUBLIC-RESULTS-UX-V2

Fecha: 2026-09-10
Estado: **IMPLEMENTADO EN RAMA / QA AUTOMATIZADO PASS / PENDIENTE DEPLOY + E2E VISUAL**

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

Workflow `Validate Telegram QA Harness` run #32: **SUCCESS**.

También continúan PASS:

- G1 / Telegram base;
- native menu;
- blue/green migration;
- aislamiento de caché entre bots.

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

- [ ] merge a `feature/sports-event-bus-v1`;
- [ ] deploy Worker SUCCESS;
- [ ] `/health/telegram-next` conserva runtime PASS y expone `public_results_ux_version=2`;
- [ ] datos deportivos sin regresión.

### U4 — E2E humano

- [ ] abrir `@FutbolChepicaBot` → Vista pública → Resultados verificados;
- [ ] visualizar home `RESULTADOS OFICIALES` sin dump largo;
- [ ] probar `Última fecha`;
- [ ] abrir un partido y comprobar tarjeta de 4 series;
- [ ] validar en iOS que el flujo se siente navegable.

## Primer bloqueo esperado

Después de U3, el siguiente gate requiere una pantalla Telegram real. La automatización puede demostrar consultas, callbacks y datos, pero no certificar por sí sola la legibilidad final en Telegram iOS.
