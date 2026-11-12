# CUDO — START HERE (control operacional propio)

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
