# CUDO es dueño de CUDO — límite operacional (12-11-2026)

**Decisión del propietario:** ARKĒ es una **biblioteca de patrones y conocimiento reutilizable**, NO el control plane de ejecución, admisión, decisiones o continuidad de CUDO. La operación CUDO no puede esperar un merge, un freeze, una cola, una autoridad de escritura ni un Owner Outcome de `carlitosvaldesmorales/arke-root/main`.

Este contrato está escrito **dentro de CUDO**. El repo de operaciones es `carlitosvaldesmorales/cudo-pago`; el portal y los bonos viven en `carlitosvaldesmorales/cudo-vnext`. No inventar repositorio, base de datos o supervisor nuevos para esta separación. `sistemas@cudo.cl` sigue siendo el **operador institucional inicial**, con controles de autorización reales. El rol técnico `TREASURER/CLUB/CUDO` no obliga a otra cuenta.

## Lo que ya existe, sin ARKĒ como dueño

- `qa-v8-google/contracts/cudo-work-item-contract-v1.json`: ciclo OPEN / IN_PROGRESS / BLOCKED / WAITING_EXTERNAL / DONE / CANCELLED, responsable, evidencia y transiciones auditadas.
- `qa-v8-google/tools/work_item_engine.mjs`: materialización estable, no duplicar trabajo, transición con estado esperado y prueba obligatoria al terminar. `qa-v8-google/state/operational-work-state.json` es una **proyección QA** derivada, no una base de verdad financiera.
- `qa-v8-google/apps-script/CudoWorkStateWeb.gs`: panel privado existente para `sistemas@cudo.cl`, solicitud de cambio en `WORK_STATE_REQUESTS`, aviso a `cudoReviewDispatch_('apps_script_work_state')`. Una solicitud pendiente NO es un trabajo ejecutado.
- `.github/workflows/certify-cudo-operational-work-state.yml`: certificación propia del repo por eventos; ningún paso del motor CUDO requiere un pase de Foreman.
- `cudo-vnext`: Cloudflare Pages, D1, Google OIDC, validación y QA de bonos, controles de cobro/publicación separados. Las operaciones financieras son del club y su proveedor, no de ARKĒ.
- `.github/workflows/cudo-arke-project-worker.yml` conserva un **adaptador opcional** de patches en ramas `agent/*`. No es la cola obligatoria ni la autoridad de CUDO; no retirarlo arbitrariamente mientras existan handoffs históricos.

## Regla ejecutable

El contrato `qa-v8-google/contracts/cudo-operational-sovereignty-v1.json` y el validador `qa-v8-google/tools/certify_operational_sovereignty.mjs` comprueban en la CI **existente** que el motor de trabajo, la interfaz privada y su certificación no reintroduzcan `arke-root`, Foreman ni el freeze de ARKĒ como dependencia de ejecución.

No proclamar que toda la plataforma CUDO es automáticamente independiente solo porque este guard pase: cubre la **ruta operacional inspeccionada**. Las integraciones opcionales, fuentes externas, las ramas históricas y los despliegues tienen límites propios.

## Continuidad real: aceptación pendiente, dentro de CUDO

1. Tomar **un evento institucional real autorizado** del flujo CUDO existente, mantenerlo con ID correlacionado en la fuente institucional, procesarlo sin leer `arke-root/main`, verificar el `WORK_ITEM`, actor, transición y evidencia.
2. Demostrar persistencia y recuperación ante interrupción desde las capacidades CUDO existentes, sin sesión de ChatGPT, sin segundo agente o cron y sin convertir un PASS de QA en una acción institucional terminada.
3. Registrar el recibo **en CUDO**, contrastarlo con el runtime/Sheets/D1 correspondientes, y solo entonces declarar `CUDO_OPERATIONAL_E2E_CONVERGED`.
4. Mantener por separado autorización financiera real, readback Mercado Pago TEST, acuse municipal y GO final antes de recaudar o publicar campaña.

**Estado al crear este contrato:** `CUDO_NATIVE_WORK_ENGINE_VERIFIED`, `CUDO_OWNED_CI_GUARD_ADDED`, `LIVE_INSTITUTIONAL_E2E_NOT_CERTIFIED`. No se han emitido mensajes, otorgado roles, modificado fondos, cambiado producción ni resuelto trámites municipales. Cualquier trabajo pendiente continúa en las fuentes CUDO, **no se pone en espera de la autoridad de ARKĒ**.
