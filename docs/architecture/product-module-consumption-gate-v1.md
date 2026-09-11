# Product Module Consumption Gate v1

Estado: ACTIVO
Ámbito: Fútbol Chépica / CUDO
Propósito: impedir que el proyecto avance por piezas técnicas mientras el módulo humano que las consume todavía no está cerrado como producto.

## Problema estructural detectado

Un backend, permiso, test, workflow o deploy puede estar correcto y aun así el módulo seguir incompleto para la persona que debe usarlo.

Por tanto:

**CAPACIDAD TÉCNICA ≠ MÓDULO DE PRODUCTO**

**IMPLEMENTADO ≠ CONSUMIBLE**

**TESTEADO ≠ VALIDADO COMO PRODUCTO**

**CONTRATO TEXTUAL ≠ VISUAL APROBADA** cuando el consumidor es humano.

La unidad oficial de progreso deja de ser el PR, endpoint, handler, permiso o test. La unidad oficial de progreso es el **módulo consumible**.

## Definición de módulo consumible

Un módulo es una unidad cerrada de valor que un actor puede usar de extremo a extremo para lograr un objetivo concreto.

Todo módulo humano debe declarar, como mínimo:

1. **Actor consumidor** — quién lo usa.
2. **Objetivo** — qué intenta lograr.
3. **Entrada** — desde dónde comienza.
4. **Visual/UX** — qué ve y cómo navega.
5. **Acciones** — qué puede ejecutar.
6. **Dato/resultado producido** — qué genera o modifica.
7. **Estado posterior verificable** — qué ve o puede comprobar al terminar.
8. **Autoridad/provenance** — qué significa el dato y quién lo originó.
9. **Dependencias** — qué módulos previos necesita realmente.

Si falta una de estas piezas, el módulo no es consumible.

## Estado de madurez obligatorio

Cada módulo recorre esta máquina de estados:

```text
DEFINED
   ↓
VISUALIZED
   ↓
PRODUCT_VALIDATED
   ↓
IMPLEMENTED
   ↓
QA_PASSED
   ↓
CONSUMABLE
```

### DEFINED

El alcance, actor, objetivo, entrada, salida y autoridad están definidos. Puede existir código previo, pero ese código no eleva la madurez del módulo.

### VISUALIZED

Existe una visual/prototipo completo del recorrido humano desde la entrada hasta el estado posterior. No basta una descripción textual ni callbacks técnicos.

### PRODUCT_VALIDATED

La visual y el contrato de interacción fueron aprobados explícitamente como la forma correcta de consumir el módulo.

### IMPLEMENTED

La implementación está alineada con la visual aprobada y con el contrato del módulo.

### QA_PASSED

El Golden Path y los negativos críticos fueron probados sobre la implementación ya alineada al contrato aprobado.

### CONSUMABLE

El actor puede completar el objetivo de extremo a extremo y el estado final es visible/verificable. Sólo aquí el módulo puede considerarse cerrado y habilitar dependencias funcionales posteriores.

## Gate duro de secuencia

Para módulos humanos:

> **No se permite nueva implementación funcional del módulo antes de PRODUCT_VALIDATED.**

El código existente que se adelantó no se borra automáticamente, pero queda clasificado como **implementación adelantada/no aprobada** y no puede usarse como evidencia de madurez.

Los tests escritos contra una UX todavía no aprobada prueban únicamente ese código; no certifican el producto.

## Dependencias

Un módulo puede ser definido mientras sus dependencias están abiertas, pero no puede avanzar a `PRODUCT_VALIDATED` o estados posteriores si una dependencia funcional requerida no está `CONSUMABLE`.

Esto evita construir B apoyado en una experiencia A que todavía puede cambiar.

Infraestructura transversal puede evolucionar de forma independiente siempre que no invente ni fije decisiones del módulo humano pendiente.

## Regla para interfaces no humanas

Si el consumidor es una máquina/API, `VISUALIZED` se reemplaza por un **contrato de interfaz verificable**. El resto del gate se mantiene.

## Evidencia, no intención

Cada transición de estado necesita evidencia verificable. Ejemplos:

- `VISUALIZED`: artefacto visual/prototipo versionado.
- `PRODUCT_VALIDATED`: referencia de aprobación explícita.
- `IMPLEMENTED`: commit/PR alineado al contrato aprobado.
- `QA_PASSED`: ejecución reproducible del QA.
- `CONSUMABLE`: prueba end-to-end con estado final comprobable.

No se promueve un módulo porque “ya casi está” o porque técnicamente funciona.

## Regla de retroceso

Si aparece una decisión que cambia el flujo visual, la entrada, la acción, la salida o la autoridad del módulo, el estado vuelve al nivel anterior afectado.

Ejemplo: si cambia la forma de registrar un resultado, un módulo `IMPLEMENTED` puede volver a `DEFINED` o `VISUALIZED`. El código existente pasa a ser evidencia histórica, no verdad de producto.

## Aplicación inmediata: Chépica Play / Registrar resultado

Contrato funcional conocido:

```text
Actor: identidad vinculada a Chépica Play
Objetivo: registrar el marcador de una serie/partido
Entrada: espacio Chépica Play en Telegram
Resultado producido: resultado informado por Chépica Play
Autoridad: aporte/observación; no reemplaza automáticamente el resultado oficial
```

Situación real actual:

```text
Dominio/capacidad definida        ✅
Permisos/provenance               ✅
Implementación técnica existente  ✅ (adelantada)
QA técnico existente              ✅ (adelantado)
Visual final aprobada             ❌
Contrato de interacción aprobado  ❌
Módulo consumible                 ❌
```

Por lo tanto, su madurez oficial es **DEFINED**.

La siguiente acción válida es construir y validar la visual completa del módulo. No corresponde seguir profundizando código, QA o módulos dependientes hasta que esa visual sea aprobada.

## Invariante operativo

> **Primero cerrar el módulo que la persona consume. Después permitir que el proyecto se apoye en él.**

La secuencia normativa es:

```text
DOMINIO CORRECTO
      ↓
MÓDULO DEFINIDO
      ↓
VISUAL COMPLETA
      ↓
VALIDACIÓN DE PRODUCTO
      ↓
IMPLEMENTACIÓN
      ↓
QA
      ↓
MÓDULO CONSUMIBLE
      ↓
SIGUIENTE MÓDULO
```
