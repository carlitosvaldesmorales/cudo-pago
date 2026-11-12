# CUDO — reparación integral de desvíos de autoridad y continuidad (2026-11-12)

## Decisión raíz corregida

**CUDO es un sistema institucional autónomo respecto de ARKĒ.** ARKĒ puede aportar patrones reusables y trazas históricas. No es la autoridad de operación, backlog, decisiones, permisología, despliegue, orden de ejecución ni reconciliación de CUDO. Su rama `main`, Foreman, Owner Outcome o estado de quiesce **nunca constituyen condición para que el flujo nativo CUDO avance**.

La desviación fue causada por el ejecutor/arquitecto asistente que trató las pistas del control plane ARKĒ como autoridad de CUDO y convirtió el mecanismo compartido en prerequisito. La remediación y seguimiento técnicos **son responsabilidad del ejecutor**, no del propietario, quien conserva su GO institucional y las autorizaciones personales indispensables. **No declarar el sistema autónomo por haber escrito un contrato.**

## Inventario forense EVIDENCIA / CORRECCIÓN / GAP

| ID | Desvío y fuente concreta | Corrección o tratamiento vigente | Estado y aceptación |
|---|---|---|---|
| D01 | ARKĒ PR [#782](https://github.com/carlitosvaldesmorales/arke-root/pull/782) pretendía admitir CUDO Presidencia en Foreman/Owner Outcome, incluso mientras `arke-root/main` tenía una suspensión de gobierno de otros proyectos | La autoridad operativa fue inscrita **en CUDO**: [cudo-pago #246](https://github.com/carlitosvaldesmorales/cudo-pago/pull/246), commit `6d838a2`, y `qa-v8-google/contracts/cudo-operational-sovereignty-v1.json`; `AGENTS.md` previene repetición | ARKĒ #782 **abierto y no fusionado** al cierre de esta revisión. Su congelamiento NO bloquea CUDO; cierre/reclasificación de esa propuesta corresponde a autoridad ARKĒ sin cambios directos a root/main |
| D02 | `.github/workflows/cudo-mobile-adoption-event.yml` validaba una fila institucional Google Sheet y luego exigía token de aplicación y `repository_dispatch` hacia `arke-root` | Retirar **únicamente** los pasos de emisión de credencial y dispatch externo. Mantener validación Google Sheet, recibo JSON CUDO e inmutable artifact Actions. Agregar guard que prohíba reintroducir esa dependencia | Corrección en este PR, requiere CI y readback de evento real posterior. El recibo de GitHub Actions demuestra almacenamiento, NO ejecución posterior de negocio |
| D03 | PR CUDO [#245](https://github.com/carlitosvaldesmorales/cudo-pago/pull/245) documenta que su continuidad debe tener dueño persistente en ARKĒ | Mantener el trabajo valioso `Web → Apps Script → WORK_STATE_REQUESTS → WORK_ITEM → EVENTOS_APPEND_ONLY`; actualizar metadatos para que CUDO sea dueño y ARKĒ únicamente historial | PR sigue abierto; el flujo real con Sheets aún no está certificado end-to-end; no fusionar sin CI y prueba independiente |
| D04 | `preview-v8/certification/root-acceptance.json` identifica un checkpoint histórico ARKĒ como `authority_repository` | **No falsificar ni reescribir una certificación histórica.** Queda supersedido **para decisiones futuras** por la fuente actual CUDO y el contrato de soberanía; mantener la procedencia original como evidencia histórica | El documento heredado no autoriza nuevas escrituras en ARKĒ ni define estado operativo |
| D05 | `preview-v8/club-operacion-lab/index.html` enlaza un checkpoint ARKĒ como `TRACE_LINKS.checkpoint`; los contratos financieros QA incluyen referencias históricas a un mapa ARKĒ | Preservar los enlaces como **fuentes de procedencia histórica**, sin convertirlos en control de ejecución; contrastar con planillas financieras primarias para cualquier decisión real | No modificar estimaciones ni fórmulas por inferencia; sin dinero productivo |
| D06 | En `cudo-vnext/main`, `STATE.yaml` sigue describiendo corte del 2026-10-22, mientras los bonos están en la rama protegida `release/cudo-bonos-2026-rc-guarded` | Respetar fronteras: portal público operativo y release de bonos protegido como fuente de código candidato. No declarar que `main` tiene bonos ni forzar merge del release | Readback real separado de Cloudflare Pages/D1 y CI antes de GO |
| D07 | Sesión ChatGPT asumía que una prueba del agente, un commit o recibir WhatsApp cerraban gestión institucional y pedía reiterar «continúa» | El ciclo institucional termina solo con **evento real autorizado → trabajo propio CUDO → persistencia → transición válida → evidencia y recibo independiente**. Las pruebas sintéticas no cierran este GAP | E2E institucional **NOT_CERTIFIED**; no crear un cron/ejecutor paralelo para ocultarlo |
| D08 | Riesgo de confundir la cuenta «Tesorero Cudo» con requisito, o convertir Google login en concesión de rol | `sistemas@cudo.cl` es operador inicial; rol financiero sólo con autorización administrativa independiente vinculada al `sub` verificado, respetando revocaciones | Concesión real y lectura HTTP 200 **NOT_CERTIFIED**; no crear grant por login ni saltarse denegación |
| D09 | Una firma HMAC local, pagos de prueba o 0 órdenes pagadas se presentaron como cierre parcial de proveedor | Requerir recibo de webhook **genuino del proveedor** y respuesta D1, transacción TEST del canal que se habilite, validación de comercio y medio de abono | Pago TEST/webhook certificado **PENDIENTE**, dinero productivo OFF |
| D10 | Las bases del sorteo, trámites municipales y GO se mezclaron con permisos técnicos del programa ARKĒ | Bases/alcance legal y aprobación municipal se sustentan en documentos y autoridad competente; GO de lanzamiento y de recaudar corresponden al club, no a ARKĒ ni al agente | **PENDIENTE**; ningún flujo técnico implica autorización legal o recaudar |

## Fuentes de verdad por ámbito

1. Runtime primario: Apps Script + Sheets institucional, Cloudflare Pages/D1, proveedores y comprobantes auténticos.
2. Código, contratos y estado versionado: `cudo-pago` para operación y administración; `cudo-vnext` para portal, bonos y release protegido. La rama histórica de CUDO no sustituye un recibo de runtime.
3. Documentación del fabricante, bases, reglas/actas institucionales vigentes y decisiones acreditadas.
4. ARKĒ solo para ejemplos de patrones y procedencia histórica. Jamás prioridad de sus proyectos, freeze o autorización de escritura.
5. Chat y memoria de IA: índices de descubrimiento, no evidencia.

## No confundir reparación con cierre

**Materializable sin permiso humano adicional:** refactor de dependencias innecesarias, QA aislada, continuidad de `WORK_ITEM`, mejoras de evidencia, CI y verificaciones de solo lectura. Los cambios de repositorios se someten a sus protecciones y check runs.

**Solo con autorización competente:** concesión de roles, manejo de cuentas, publicación de personas, money-in/money-out, cambios en producción y GO institucional. Una denegación de herramienta se registra como GAP, no se evade por otro transporte.

**Aceptación próxima verificable:** 1 evento CUDO con fuente real y autorización válida debe generar un registro nativo, sobrevivir reintentos sin duplicación, producir un `WORK_ITEM` visible en el origen y dejar un recibo con evidencia correlacionada, **sin una llamada a `arke-root` ni pedir intervención al chat**. Si cualquier eslabón falta, permanecer `GAP`, no `CONVERGED`.

## Regla para recuperar sesiones

Al retomar CUDO: leer primero el `AGENTS.md` y el estado versionado **de CUDO**, su fuente de runtime y este inventario. No abrir ni usar un work item ARKĒ para admitir CUDO. Los errores aquí inventariados son deuda rastreable hasta que se certifique cada corrección; no reescribir sus registros históricos ni negar que ocurrió el desvío.
