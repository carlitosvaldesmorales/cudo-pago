# Consumable Module Gate v1

Estado: ACTIVO
Ámbito: Fútbol Chépica / CUDO Sports Event Bus
Objetivo: impedir que el proyecto avance por piezas técnicas mientras el producto humano todavía no existe de forma consumible.

## Problema estructural corregido

La existencia de backend, permisos, persistencia, pruebas o deploy NO demuestra que un módulo de producto esté terminado.

**CAPACIDAD TÉCNICA ≠ MÓDULO CONSUMIBLE**

Un módulo humano sólo está terminado cuando una persona puede entrar, entender qué hacer, completar la tarea y reconocer el estado final sin conocer la arquitectura interna.

## Unidad oficial de progreso

La unidad de avance del producto es el **MÓDULO CONSUMIBLE**, no el PR, endpoint, handler, tabla, permiso, test ni deploy.

Un cambio técnico puede existir como soporte o deuda histórica, pero no habilita avance funcional hasta que el módulo llegue a `CONSUMIBLE`.

## Secuencia obligatoria

Para cada módulo humano:

```text
AFINACIÓN
alcance + actor + objetivo + límites
        ↓
PROTOTIPO / CONTRATO VISUAL
pantallas + botones + navegación + estados
        ↓
VALIDACIÓN DE PRODUCTO
la experiencia es aceptada antes de codificar
        ↓
EJECUCIÓN
implementación contra el contrato aprobado
        ↓
QA / MOF+
golden path + negativos + estado final
        ↓
DEPLOY / VALIDACIÓN DE RUNTIME
la implementación desplegada coincide con el contrato
        ↓
CONSUMIBLE
        ↓
recién entonces puede habilitar módulos dependientes
```

## Estados de madurez

Estados válidos, en orden:

1. `DEFINED` — intención, actor, objetivo y alcance declarados.
2. `VISUAL_PENDING` — falta resolver o validar la experiencia visual/interactiva.
3. `PRODUCT_VALIDATED` — contrato visual/operacional aprobado por producto.
4. `IMPLEMENTED` — runtime implementado contra el contrato aprobado.
5. `QA_CERTIFIED` — Golden Path y fallos críticos pasan sobre implementación aislada.
6. `CONSUMABLE` — deploy/runtime comprobado y experiencia final reconocible para su consumidor.

No se puede promover un módulo saltando estados.

## Regla de dependencia

**Un módulo que no está `CONSUMABLE` no puede habilitar avance funcional de un módulo dependiente.**

Se permite construir infraestructura interna reusable, pero esa infraestructura:

- no cuenta como progreso del módulo humano;
- no cambia el estado del módulo;
- no autoriza construir funcionalidades dependientes;
- no sustituye visual, validación de producto ni experiencia final.

## Gate visual obligatorio

Para módulos consumidos por personas, la visual es parte del contrato funcional y ocurre ANTES de implementar.

El contrato visual debe mostrar, como mínimo:

- actor que entra;
- punto de entrada;
- pantalla/estado inicial;
- acciones disponibles;
- navegación completa del Golden Path;
- confirmaciones y errores relevantes;
- estado final que demuestra que la tarea terminó;
- salida/retorno claro.

**Testear una interfaz inventada por la implementación no equivale a validar el producto.**

Los agentes QA validan el contrato aprobado; no lo definen retroactivamente.

## Gate de producto

Antes de `IMPLEMENTED`, debe existir evidencia explícita de que el contrato visual/operacional fue aceptado.

Si durante QA aparece una duda de producto, el módulo retrocede al estado correspondiente. No se resuelve la duda agregando lógica por inferencia.

## Gate de QA / MOF+

Una vez implementado el contrato aprobado, QA debe demostrar como mínimo:

- Golden Path completo;
- identidad/actor correcto;
- contrato visual exacto;
- idempotencia/duplicado;
- acción stale/obsoleta cuando aplique;
- autorización/scope negativo;
- estado final verificable;
- ausencia de mutaciones fuera del alcance;
- separación observado/canónico cuando corresponda.

## Regla de retroceso

Si aparece una desviación:

1. determinar el primer estado de madurez cuya evidencia era inválida;
2. volver a ese estado;
3. bloquear módulos dependientes;
4. conservar código/QA adelantado sólo como material experimental, no como verdad de producto;
5. corregir contrato;
6. reimplementar/revalidar desde esa frontera.

No se parchea hacia adelante para evitar volver atrás.

## Regla de evidencia

Cada módulo debe poder responder:

```text
MÓDULO:
ACTOR:
OBJETIVO:
ESTADO DE MADUREZ:
CONTRATO VISUAL:
VALIDACIÓN DE PRODUCTO:
IMPLEMENTACIÓN:
QA:
RUNTIME:
DEPENDENCIAS:
ESTADO FINAL CONSUMIBLE:
```

Cualquier campo desconocido se declara GAP. Un GAP en una etapa obligatoria impide promover el módulo.

## Aplicación inmediata: Chépica Play

Chépica Play tiene actualmente dos módulos de producto declarados:

```text
CP-RESULTS-CONSUME
→ consultar resultados

CP-RESULTS-REGISTER
→ registrar resultados
```

La existencia de handlers, RBAC, invitaciones, persistencia o pruebas para estos flujos no los convierte automáticamente en consumibles.

Especialmente `CP-RESULTS-REGISTER` no puede avanzar más allá de `VISUAL_PENDING` mientras no exista y se acepte la experiencia visual completa de registro.

Todo trabajo posterior que dependa de ese módulo queda bloqueado hasta su certificación `CONSUMABLE`.

## Invariante operativo

> **Diseñar el módulo que una persona consumirá, validarlo, implementarlo y certificarlo. Recién entonces construir lo que depende de él.**
