# CUDO — START HERE (control operacional propio)

## 15-11-2026 · CUDO BONOS MAIN VIGENTE Y FINANZAS CANÓNICAS

**Estado prevalente del sitio CUDO (no del dinero):** [CUDO vNext PR #42](https://github.com/carlitosvaldesmorales/cudo-vnext/pull/42) está MERGED en `main` desde 15-11-2026, no sigue abierto DRAFT. [PR #91](https://github.com/carlitosvaldesmorales/cudo-vnext/pull/91) fusionó la **caja única**/trazabilidad de ganador a `main`, SHA `c42438bdac90b4e8313c77d1737aa7fa9c27aa86`, Cloudflare PROD deployment `5392e03c-4bf2-4983-9446-bcd00b50b46a` **SUCCESS**. El backend conserva flags PUBLIC/MONEY/SELLER/TREASURY OFF. `cudo.cl` responde 403 a Tesorería sin grant, dinero no autorizado. Auth PROD 0 usuarios/grants, bonos PROD 0 órdenes/conciliaciones/tickets/sorteos.

**Patrón CUDO, no otra arquitectura:** `cudo-pago/qa-v8-google/tools/canonical_financial_core.mjs` es byte-idéntico a `cudo-vnext/lib/canonical_financial_core.mjs`; ya se usa para proyectar ONE orden/obligación + movimientos certificados CASH/BANK/MP THIRD_PARTY + settlements, sin tratar pago MP aprobado como depósito al banco. Tesorería y sorteo leen la misma proyección. El adaptador CUDO Pago `buildSheetsReadModelProjection` fue reutilizado en la API privada CUDO vNext `/api/rifa-qa/treasury/summary?readModel=CUDO_SHEETS_READ_MODEL_V1`, NO es escritura automática a Sheets. Sorteo ganador se vincula privadamente a número, orden, pase QR/folio y prueba de dinero, sin acreditar entrega física del premio. CUDO Pago `certify_canonical_financial_core.mjs` y `certify_projection_persistence_adapters.mjs` PASS originales el 15-11-2026; CUDO vNext 422/422 tests PASS, Actions artefactos siguen quota-fail.

**GAP INSTITUCIONAL:** [CUDO_LEDGER_V1 de Google Sheets](https://docs.google.com/spreadsheets/d/1f0TYrlHOMef6dx08o6LxJb4va4nEL0CNBt8dTsdcNbo/edit) está presente pero tiene una sola fila histórica 2025, mientras su vista de saldos muestra valores no derivados de esa fila. `EFD_LOG_V1` y `CUDO_COMPROBANTES_V1` están vacías salvo encabezados y cuentan con `TX_ID`; el libro principal no tiene TX_ID. No sincronizar dinero con APPEND inseguro ni inventar una segunda caja. Reutilizar el plan/aplicador de proyección CUDO Pago con revisión causal, deduplicación TX_ID, fuente de efectivo/transferencia y prueba bancaria de liquidación MP antes de declarar caja real. Último eslabón: WORK_ITEM/comprobante del premio efectivamente entregado. [Misión CUDO control plane Issue #3](https://github.com/carlitosvaldesmorales/cudo-control-plane/issues/3#issuecomment-6905918812) y [código/evidencia](https://github.com/carlitosvaldesmorales/cudo-vnext/blob/main/docs/CUDO_BONOS_CAJA_UNICA_Y_GANADOR_TRAZABLE_20261115.md). `production_go=false` y `business_converged=false`.

---

**Proyecto:** Club Deportivo Unión Orilla (CUDO) / Club OS abierto y adaptativo.

**Autoridad:** runtime real y repositorios propios de CUDO. `carlitosvaldesmorales/arke-root` es fuente histórica/opcional de patrones, **no** es dueño ni un gate para ejecutar, evolucionar o decidir CUDO.

## Leer antes de trabajar o continuar otra sesión

1. **Norte del producto:** [Intención 0 Club OS CUDO](docs/CUDO_INTENCION_0_CLUB_OS_PROPIA_20261112.md): realidad del club, estado compartido, objetivos, brechas, acción, resultado y aprendizaje. La Web CUDO es la superficie operacional primaria, la app móvil reutiliza esos flujos después.
2. **Regla de seguridad y trabajo para agentes:** [AGENTS.md](AGENTS.md), [contrato ejecutable de autonomía](qa-v8-google/contracts/cudo-operational-sovereignty-v1.json) y prueba `qa-v8-google/tools/certify_operational_sovereignty.mjs`.
3. **Errores de autoridad y su reparación:** [Registro D01-D10 con readback](docs/CUDO_REPARACION_DESVIOS_20261112.md). No reintroducir dependencia de Foreman ni borrar procedencia histórica.
4. **Operación de actividades/administración:** `qa-v8-google/apps-script/CudoWorkStateWeb.gs`, `qa-v8-google/contracts/cudo-work-item-contract-v1.json`, `qa-v8-google/tools/work_item_engine.mjs`, `qa-v8-google/state/operational-work-state.json` (última solo es QA). Seguir [PR #245](https://github.com/carlitosvaldesmorales/cudo-pago/pull/245) para la rama de creación sin asignar; no tratarlo como desplegado mientras esté abierto.
5. **Portal y bonos:** `carlitosvaldesmorales/cudo-vnext`; `main` para sitio productivo vigente y `release/cudo-bonos-2026-rc-guarded` para preparación de bonos, con controles Google OIDC, D1, Pages y proveedor por separado. [Candidato de bonos #42](https://github.com/carlitosvaldesmorales/cudo-vnext/pull/42) **NO GO** de dinero o publicación.
6. **Runtime primario siempre prevalece:** estado de Google Sheets/Apps Script, Cloudflare Pages/D1, proveedor financiero, documentación oficial, decisiones y actas. No asumir que un commit/CI/preview es resultado de negocio.

## Estado verificado de separación de autoridad — 12 noviembre 2026

- **CUDO Pago #246 y #247 fusionados a main:** soberanía declarada, AGENTS, auditoría de desvíos, validación móvil CUDO sin despacho obligatorio a ARKĒ, CI de CUDO aprobado.
- **CUDO vNext #67 fusionado al release protegido:** AGENTS propio y prueba de aislamiento, sin abrir recaudación.
- **ARKĒ #782 cerrado sin fusionar:** tentativa histórica de someter CUDO a Foreman cancelada; la autoridad raíz de ARKĒ no gobierna CUDO.
- **E2E institucional CUDO:** `NOT_CERTIFIED`; no fingir autonomía completa. `sistemas@cudo.cl` único operador inicial, permisos reales aún condicionados.
- **Dinero productivo:** `OFF`; no activar campaña ni asignar roles por una conversación.

## Próxima aceptación, en CUDO (no en ARKĒ)

Una acción institucional autorizada debe recorrer **CUDO Web → solicitud en Sheets/Apps Script → motor CUDO → WORK_ITEM y responsable/estado/evidencia → recibo durable → readback en Web**, con identidad, idempotencia y pruebas de recuperación. Hasta entonces, estado `GAP`, no `CONVERGED`.

**Regla de continuidad:** nadie debe solicitar al propietario que repita «continúa» para tareas técnicas. El trabajo persistente queda en CUDO; una sesión ChatGPT no es un worker asíncrono. Lo único que exige acción humana es la aprobación/autenticación institucional imprescindible.

## CUDO bonos · continuidad de misión sin desvíos (12-11-2026)
**Intención vigente del propietario:** vender bonos solidarios CLP 2.000 para la camiseta firmada mediante tarjeta, transferencia y efectivo; tras pago auténtico verificado, registrar números y entregar boarding pass con folio y QR CUDO. Para continuar, consultar primero [la intención operativa versionada en CUDO vNext](https://github.com/carlitosvaldesmorales/cudo-vnext/blob/release/cudo-bonos-2026-rc-guarded/docs/CUDO_BONOS_INTENCION_0_Y_CONTINUIDAD_SIN_DESVIOS_20261112.md), junto a `cudo-vnext/AGENTS.md`, su release protegido, recibos y runtime. Mastercard TEST ya certificado; no repetirlo. Los mecanismos y el ticket existen, no duplicarlos. Sin nueva cuenta de tesorero, correos municipales, agentes paralelos, cambios globales de herramientas ni mensajes sin autorización específica. No confundir desarrollo/QA con GO de cobros o publicación. [PR #69, ajuste de QR offline y bootstrap](https://github.com/carlitosvaldesmorales/cudo-vnext/pull/69).
