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

---

## Readback posterior independiente — 2026-11-12 (estado de cierre, sin inferencias)

**A partir de este punto, las expresiones históricas «este PR» o «requiere CI» en D02 se leen como relato de la fase de preparación, no como estado pendiente.**

| Control observado | Resultado auténtico |
|---|---|
| [CUDO Pago #247](https://github.com/carlitosvaldesmorales/cudo-pago/pull/247) | **MERGED** en `cudo-pago/main`, commit `60b4e5de62d0c2e910b658e403871ad045f0296e`. Validadores previos `root-acceptance`, `certify` (2) PASS. Post-merge `build`, `deploy`, `report-build-status` PASS |
| Workflow de adopción móvil CUDO, leído desde `main` | Conservar verificación de fila Google Sheets y `actions/upload-artifact@v4`. No contiene `repos/carlitosvaldesmorales/arke-root/dispatches`. **No** afirma que haya ocurrido un evento institucional nuevo |
| [CUDO vNext #67](https://github.com/carlitosvaldesmorales/cudo-vnext/pull/67) | **MERGED** solo en `release/cudo-bonos-2026-rc-guarded`, commit `0e4a97cb34f42ea7930cc1b4d7f904b56738df0b`; controles `Cloudflare Pages`, `receipt-guards`, `preview-readback`, `release-bundle`, `production-public-readback` PASS. No merge de bonos a productivo |
| [ARKĒ #782](https://github.com/carlitosvaldesmorales/arke-root/pull/782) | **CLOSED, NOT MERGED** a las 13:09:39Z; `arke-root/main` seguía en `2a0db206df9cb7ca94103fd550798daa8c2f82ab`. No se reactivó Foreman para CUDO |
| [CUDO Pago #245](https://github.com/carlitosvaldesmorales/cudo-pago/pull/245) | **OPEN** con rectificación visible al comienzo de la descripción: su trabajo nativo no depende de admisión ARKĒ. Faltan prueba real Apps Script/Sheets y autorización institucional para acciones concretas |
| [CUDO vNext #42](https://github.com/carlitosvaldesmorales/cudo-vnext/pull/42) | **OPEN** con rectificación visible al comienzo de la descripción. Sigue candidato de release, no GO monetario |
| Cloudflare Pages, inspección read-only | Preview success. Producción `CUDO_BONOS_PRODUCTION_ENV=false`, `CUDO_BONOS_PUBLIC_HOST_ACTIVE=false`, `RIFA_QA_ACTIVE=false`, `RIFA_QA_MP_TEST_ACTIVE=false`; QA TEST activa y sin dinero productivo |
| End-to-end institucional real | **NO CERTIFICADO**. Ningún `WORK_ITEM` real, webhook auténtico, grant financiero o permiso municipal fue creado o aprobado por estas correcciones |

### Conclusión de la auditoría, no del producto

**Desvío de autoridad y acoplamiento live identificado:** corregido en fuentes CUDO versionadas y protegido por QA. **Autonomía operativa del club:** parcial, pendiente de demostrar con un evento y recibo reales sin dependencia del chat. Los GAP legítimos de autorizaciones y dinero no desaparecieron y no deben ocultarse dentro de «independencia».

La responsabilidad de revisar y corregir desvíos técnicos futuros recae sobre el sistema ejecutor y sus controles en CUDO; el propietario no actuará como coordinador manual ni aprobará retrospectivamente inferencias falsas. Se preservan todas las huellas históricas.
