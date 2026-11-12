# AGENTS.md — CUDO: autoridad operativa propia

## Intención raíz
**CUDO es la autoridad de su propia operación.** El Club Deportivo Unión Orilla decide su rumbo, el trabajo y sus efectos; **ARKĒ es solo una fuente opcional de patrones y referencia**, nunca un dueño, árbitro de prioridades, almacén canónico ni motor obligatorio de CUDO.

**Punto de entrada obligatorio propio:** [00_START_HERE.md](00_START_HERE.md) y [Intención 0 Club OS](docs/CUDO_INTENCION_0_CLUB_OS_PROPIA_20261112.md). No confundir la independencia técnica con perder el objetivo abierto, causal, integral y Web-first del Club OS.

## Bootstrap correcto, también cuando se retoma otra sesión
1. Descubrir el proyecto y consultar **primero la fuente primaria CUDO** correspondiente: `carlitosvaldesmorales/cudo-pago` para trabajos, eventos y administración, `carlitosvaldesmorales/cudo-vnext` para portal/bonos, y servicios reales (Apps Script/Sheets, Cloudflare D1/Pages, proveedor de pagos) para el runtime.
2. Leer el estado vigente y las pruebas/decisiones versionadas **en CUDO**. `docs/CUDO_AUTONOMIA_OPERACIONAL_20261112.md` y `docs/CUDO_REPARACION_DESVIOS_20261112.md` establecen el límite. La conversación, los resúmenes de IA y los PR de ARKĒ son pistas históricas, no estado operativo actual.
3. ARKĒ puede consultarse para un patrón técnico cuando sea útil, pero **ningún trabajo ordinario de CUDO exige autorización de arke-root/main**, su Foreman, reconciliador, cola, quiesce, Owner Outcome o políticas de escritura. No registrar admisiones CUDO nuevas en ARKĒ como requisito para trabajar.
4. Conservar el mecanismo CUDO que ya exista: `qa-v8-google/tools/work_item_engine.mjs`, Apps Script `CudoWorkStateWeb.gs`, la planilla privada `WORK_STATE_REQUESTS`, eventos, certificaciones GitHub, y en bonos los contratos D1/Pages/Google OIDC. No crear otra cola, base de datos, agente ni cron por comodidad.
5. Separar siempre **EVIDENCIA / INFERENCIA / GAP**. No declarar trabajo DONE sin evidencia, pago PAID sin fuente financiera independiente, notificación entregada sin proveedor ni autonomía E2E a partir de un test unitario.
6. `sistemas@cudo.cl` es el operador institucional inicial. Permisos se otorgan únicamente mediante vía administrativa independiente y admitida; ningún login otorga rol. Cambios con dinero, personas o publicación requieren la autoridad y el GO aplicables.
7. Cada cambio relevante deja contrato, test y recibo **en CUDO**, con referencia a la fuente real. Reparar regresiones y arrastrar pendientes dentro de CUDO; nunca pedir al propietario que actúe como coordinador técnico ni que diga «continúa» para resolver trabajo propio del motor.

## Herencia de patrones
`.github/workflows/cudo-arke-project-worker.yml` sigue siendo un **adaptador histórico opcional**, acotado a su contrato; no es la autoridad ni una dependencia del motor institucional. No reintroducir una llamada obligatoria a `arke-root` en workflows de entrada CUDO. Los documentos históricos con enlaces a ARKĒ preservan procedencia, no gobiernan el estado presente.

## Control de regresión
Ejecutar `node qa-v8-google/tools/certify_operational_sovereignty.mjs` junto con las pruebas del motor. Si el guard falla, corregir el acoplamiento CUDO real: no modificar el guard para esconder la regresión. Ninguna de estas instrucciones equivale por sí misma a que el flujo institucional end-to-end esté certificado.

## Prioridad CUDO bonos 2026 · contrato de misión (12-11-2026)
Al retomar venta de bonos, **leer antes de decidir** [intención 0 y continuidad sin desvíos en CUDO vNext](https://github.com/carlitosvaldesmorales/cudo-vnext/blob/release/cudo-bonos-2026-rc-guarded/docs/CUDO_BONOS_INTENCION_0_Y_CONTINUIDAD_SIN_DESVIOS_20261112.md). El alcance es CLP 2.000 por participación, medio de pago existente, confirmación real del ingreso, registro y números D1, comprobante boarding pass con QR. La verificación de Mastercard TEST y la emisión del QR ya tienen recibos; no reabrir. Priorizar defectos y conexiones del release, delegados a los agentes existentes si están disponibles, sin nuevos motores ni solicitudes técnicas al propietario. Prohibido confundir esta delegación con autorización para enviar email/WhatsApp, escribir a autoridades externas, modificar roles, activar dinero o publicar la campaña. Cada efecto externo necesita el GO correspondiente.
