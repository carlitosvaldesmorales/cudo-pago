# CUDO — Intención 0, Club OS propio (ratificación de continuidad 2026-11-12)

## El objetivo original, ahora ubicado en CUDO

**CUDO debe representar, entender y ayudar a dirigir la realidad completa del club, aunque no todos los eventos, necesidades, procesos, recursos o roles estén definidos de antemano.** Su raíz semántica es `CLUB`; el dominio es `OPEN_WORLD` y el comportamiento esperado es un ciclo adaptativo de observación, evidencia, brechas, acción, resultado y aprendizaje.

No se está construyendo un grupo de apps desconectadas, ni un dashboard, ni una app móvil que dicte las reglas de negocio. La **primera superficie operativa es CUDO Web**, donde una persona autorizada debe poder iniciar, ver, asignar, ejecutar y cerrar de extremo a extremo un trabajo real del club. La **app móvil es secundaria**: consume, simplifica y habilita las mismas capacidades ya operativas en la Web.

La finalidad comunitaria sigue siendo ayudar al club y sus personas mediante administración, deporte, actividades y generación/custodia de recursos. No convertir sus bingos, rifas o aportes en un comercio digital distinto al propósito institucional.

## Bucle de control declarado

```text
REALIDAD -> OBSERVACIONES CON PROCEDENCIA -> ESTADO DEL CLUB
  -> OBJETIVOS / COMPROMISOS / RESTRICCIONES
  -> BRECHAS (también hechos todavía desconocidos)
  -> ACCIONES POSIBLES -> DECISIÓN SEGÚN AUTORIDAD
  -> EJECUCIÓN -> EFECTOS / RECIBOS / EVIDENCIA
  -> ACTUALIZACIÓN DEL ESTADO -> APRENDIZAJE Y RECÁLCULO
```

Los hechos sin categoría no desaparecen. Las metas no se inventan, las prioridades no se esconden en constantes sin fuente y una inferencia no se convierte silenciosamente en decisión del club. Los roles/cargos derivan de necesidades y evidencia; una actividad no asignada sigue siendo visible. La acumulación de tareas no demuestra por sí sola sobrecarga humana.

## Primera experiencia que debe quedar real y cerrada

**Registrar actividad/trabajo, incluso `UNASSIGNED` → mostrarlo en la Web → asignar/reasignar responsable existente y autorizado → mostrar dependencias/fechas/bloqueos → cambiar estado con precondición → completar solo con evidencia → conservar auditoría y reflejar efectos derivados.**

Comenzar por una necesidad o actividad real (por ejemplo un partido o generar recursos para un objetivo del club), pero **MATCH es una instancia de `ACTIVITY_OR_EVENT`**, no una arquitectura exclusiva; Bingo y otras actividades deben compartir el mismo núcleo causal con reglas distintas.

El dinero, compromisos, ingresos, gastos, caja y stock son efectos conectados al mismo `CLUB_STATE`, **no un módulo posterior desconectado**. Distinguir obligación, pago y conciliación comprobada; sin doble digitación de datos derivables.

## Reutilización comprobable en CUDO — no crear otro sistema

| Contrato o capacidad ya localizada en CUDO | Ruta primaria |
|---|---|
| Contrato de `WORK_ITEM` y estados/gestión por evidencia | `qa-v8-google/contracts/cudo-work-item-contract-v1.json` |
| Motor de trabajo, derivación, idempotencia y transiciones | `qa-v8-google/tools/work_item_engine.mjs` |
| Trabajo sin responsable en preparación de QA | [CUDO PR #245](https://github.com/carlitosvaldesmorales/cudo-pago/pull/245) |
| Solicitudes Web privadas del operador institucional | `qa-v8-google/apps-script/CudoWorkStateWeb.gs` y `WORK_STATE_REQUESTS` |
| Contrato de objetos compartidos y propagación causal | `qa-v8-google/contracts/cudo-shared-object-contract-v1.json` y herramientas de `qa-v8-google/tools/` |
| Estado/proyección QA (no dinero real) | `qa-v8-google/state/operational-work-state.json` |
| Validación de independencia y CI | `qa-v8-google/tools/certify_operational_sovereignty.mjs`, `.github/workflows/certify-cudo-operational-work-state.yml` |
| Portal público, Cloudflare, bonos y D1 aislada | `carlitosvaldesmorales/cudo-vnext`; bonos en `release/cudo-bonos-2026-rc-guarded` |
| Inventario de errores de dependencia y estado de reparación | `docs/CUDO_REPARACION_DESVIOS_20261112.md` |

### Aceptación verdadera, no componente por componente

Una prueba de código, fixture, CI, mock visual, handler disponible o evento recibido **no** significa que esa gestión esté terminada. El recorrido debe ser realmente operable y persistir de extremo a extremo desde la Web, con identidad y autoridad, fuente primaria, evidencia y recibo. La experiencia móvil puede usarlo después. Cuando el flujo ya está probado, avanzar al siguiente cluster real del CLUB, no profundizar una POC sin brecha estructural.

## Separación de dominios y autoridad

**Control plane operativo:** propios repositorios CUDO más runtime primario. El mecanismo de continuidad debe registrar `WORK_ITEM`, eventos y receipts **en CUDO**, sin Gate de `arke-root/main`, quiesce, Owner Outcome, Foreman ni agente externo obligatorio. `sistemas@cudo.cl` es operador institucional único inicial; otros roles se asignan con procesos autorizados, no por iniciar sesión.

**ARKĒ:** repositorio histórico de patrones y antigua documentación de descubrimiento. No se debe destruir la procedencia histórica de estas decisiones, pero a partir de ahora **CUDO conserva su versión de la intención 0 y decide qué cambios son válidos**.

**Fuentes oficiales y decisiones humanas:** tienen precedencia sobre IA. Dinero, personas, cambios de reglas, autorizaciones, sanciones y publicación tienen sus propios gates. Ningún agent puede inferir un GO.

## Evidencia de procedencia y corrección crítica

Esta intención se recuperó del registro histórico de 2026-09-18/19 en `arke-root/main`, en particular:
- `05_CASOS/CASO_CUDO_001/CUDO_INTENTION_ZERO_OPEN_WORLD_ADAPTIVE_CLUB_OS_v1.yaml`;
- `05_CASOS/CASO_CUDO_001/CUDO_OPERATIONAL_ADMINISTRATION_INTENT_v1.yaml`;
- `05_CASOS/CASO_CUDO_001/CUDO_ALGEBRAIC_STRATEGY_NORTH_v1.yaml`;
- `status/CUDO_CLUB_ADMINISTRATION_DISCOVERY_STATUS.yaml`.

**Corrección expresa:** aquel documento histórico situaba `ARKE_control_plane` por encima de artefactos versionados del proyecto en el orden de autoridad. Eso fue **precisamente el desvío**. Se reemplaza en CUDO por este orden: (1) runtime y fuentes primarias, (2) decisiones/estado/artefactos versionados de CUDO, (3) documentación oficial y normativa, (4) patrones externos opcionales, (5) recuerdos del chat e inferencias, siempre rotulados.

No se trasplantan como estados actuales los `PASS`, `next_action`, prioridades y cifras de septiembre: cada uno requiere contraste con su código/CI y fuente real vigente.

## GAPs actuales, sin confundirlos con propiedad de CUDO

1. **Club OS Web end-to-end real:** falta validación independiente de actividades no asignadas, vinculación a persona autorizada, cambio de estado, persistencia, evidencia de cierre y seguimiento autónomo sin sesión de ChatGPT. La QA y el PR #245 no demuestran despliegue ni ejecución real.
2. **Continuidad residente:** el evento de adopción móvil ya no necesita ARKĒ para validarse y archivar su recibo, pero **no** constituye el ciclo de negocio del Club OS completo. Conectar exclusivamente a los mecanismos autorizados CUDO existentes, sin un nuevo supervisor o cron.
3. **Bonos:** identidad financiera de Sistemas, callback genuino del proveedor, conciliación de efectivo/transferencia, bases, trámite institucional y GO humano siguen independientes y abiertos; producción no recauda.

**Próxima operación mínima propia:** certificar Web autenticada CUDO → `WORK_STATE_REQUESTS` real → proceso CUDO → `WORK_ITEM` visible → una transición validada y recibo durable, sin depender ni consultar el estado operativo de ARKĒ para autorizar el avance. No fabricar una tarea humana o prueba real; si se necesita autorización imprescindible, declarar `HUMAN_GATE` específica.
