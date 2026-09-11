# Domain Modeling Gate v1

Estado: ACTIVO
Ámbito: Fútbol Chépica / CUDO Sports Event Bus
Objetivo: impedir desvíos de arquitectura causados por convertir contexto, inferencias o posibilidades futuras en requisitos actuales.

Este gate se usa obligatoriamente junto con `docs/architecture/consumable-module-gate-v1.md`.

## Invariantes principales

Antes de diseñar permisos, UX o implementación, separar explícitamente:

**ORGANIZACIÓN ≠ IDENTIDAD ≠ ROL ≠ SCOPE ≠ ASIGNACIÓN ≠ ACCIÓN ≠ OBSERVACIÓN ≠ VERDAD CANÓNICA**

Y, por encima de todo:

**CONTEXTO ≠ REQUISITO**

Además:

**CAPACIDAD TÉCNICA ≠ MÓDULO CONSUMIBLE**

Que sepamos cómo una organización trabaja en el mundo real no autoriza a incorporar esa operación al producto. Que exista código, persistencia o QA tampoco autoriza a declarar terminado un módulo humano.

## Gate de alcance antes del modelado

Antes de recorrer la topología del dominio, clasificar cada dato en una de estas categorías:

- **REQUISITO DECLARADO**: capacidad que debe existir ahora. Puede entrar al diseño.
- **CONTEXTO**: información que ayuda a entender al actor, pero no crea funciones del producto.
- **HIPÓTESIS / POSIBLE EVOLUCIÓN**: opción futura. No se implementa.
- **GAP**: falta una decisión que puede cambiar el diseño. Se detiene sólo esa parte.

Una inferencia nunca puede ascender de CONTEXTO/HIPÓTESIS a REQUISITO sin validación explícita.

## Orden obligatorio de trabajo

Toda capacidad humana nueva o cambio relevante debe recorrer este orden:

1. **Alcance declarado** — qué se pidió realmente y qué queda fuera.
2. **Módulo de producto** — actor, objetivo humano, entrada, salida y frontera del módulo.
3. **Dominio real necesario** — sólo la parte del mundo real necesaria para ese módulo.
4. **Topología de actores necesaria** — únicamente actores/relaciones requeridos por el alcance actual.
5. **Persistencia / scope / autoridad / provenance** — sólo lo necesario para soportar el módulo.
6. **Prototipo / contrato visual** — pantallas, botones, navegación, errores y estado final.
7. **Validación de producto** — aceptación explícita del contrato antes de implementarlo.
8. **Implementación** — código contra el contrato validado.
9. **QA / MOF+** — Golden Path, fallos críticos y estado final verificable sobre la implementación.
10. **Deploy / validación de runtime**.
11. **CONSUMIBLE** — sólo entonces puede habilitar módulos dependientes.

Esto implementa la secuencia operativa: **Afinación → Prototipo/estructura → Validación → Ejecución → QA → Consumible**.

**No se agrega una capa sólo porque exista en el mundo real y no se avanza una capa sólo porque exista código.**

## Domain Actor Fidelity Gate

Antes de aprobar un actor sintético o real, responder:

- ¿Qué módulo/capacidad declarada estamos representando?
- ¿Qué información sobre este actor es requisito y cuál es sólo contexto?
- ¿Es una persona, organización, sistema o autoridad para efectos de esta capacidad?
- ¿Qué acciones necesita realizar ahora?
- ¿Qué acciones sabemos que realiza en el mundo real pero NO forman parte del producto actual?
- ¿Qué dato produce: observación, recomendación, decisión o verdad canónica?
- ¿Qué provenance mínimo necesita el requisito actual?

Sólo si una relación adicional es necesaria para cumplir la capacidad declarada se modelan miembros, asignaciones u otras capas.

Si una respuesta desconocida cambia el requisito actual, se declara **GAP** y se detiene esa parte. No se rellena por inferencia silenciosa.

## Product Consumption Gate

Para un módulo consumido por personas, el contrato visual es parte del requisito, no una decoración posterior.

Antes de implementar debe existir una respuesta concreta para:

```text
ACTOR:
PUNTO DE ENTRADA:
PANTALLA/ESTADO INICIAL:
ACCIONES DISPONIBLES:
GOLDEN PATH VISUAL:
ERRORES/NEGATIVOS RELEVANTES:
ESTADO FINAL:
RETORNO/SALIDA:
```

Si esa experiencia no está validada, el módulo permanece `VISUAL_PENDING` aunque ya exista código técnico.

Los agentes QA pueden falsar una experiencia aprobada. No pueden convertir una experiencia inventada por el código en requisito válido.

## Regla de dependencia

Un módulo no `CONSUMABLE` no puede habilitar avance funcional de un módulo dependiente.

La infraestructura interna sí puede adelantarse cuando es reusable y segura, pero no cuenta como progreso del módulo y no cambia su madurez.

## Regla de desvío

Una descripción contextual como:

```text
“la organización transmite partidos”
“tiene personas en varias canchas”
“concentra información de distintas fuentes”
```

NO implica automáticamente:

```text
coberturas en el producto
corresponsales en el RBAC
asignaciones por partido
captura de eventos en vivo
agregación de goles
```

Del mismo modo:

```text
handler implementado
CI verde
D1 persistiendo
simulación E2E
```

NO implica automáticamente:

```text
módulo visual resuelto
producto validado
experiencia consumible
permiso para construir dependencias
```

## MOF+

MOF+ se ejecuta DESPUÉS de la validación de producto y de la implementación del contrato aprobado.

Debe demostrar, como mínimo:

- actor sintético que represente correctamente el alcance declarado;
- vertical end-to-end representativa;
- Golden Path;
- contrato visual exacto respecto de la experiencia aprobada;
- idempotencia/duplicado;
- callback o acción obsoleta cuando aplique;
- fuera de scope / autorización;
- estado final verificable;
- separación entre observación y estado canónico cuando corresponda.

El MOF+ no define el producto retroactivamente.

## Ejemplo normativo: Chépica Play

Contexto conocido puede existir, pero el requisito actual declarado es únicamente:

```text
CHÉPICA PLAY
    ├── CONSUMIR RESULTADOS
    └── REGISTRAR RESULTADOS
```

Por tanto, cualquier funcionalidad adicional queda fuera mientras no sea declarada explícitamente.

Registrar un resultado conserva la separación:

```text
RESULTADO INFORMADO POR CHÉPICA PLAY
        ↓
REVISIÓN / GOBIERNO
        ↓
RESULTADO CANÓNICO
```

### Estado de madurez

El estado real de cada módulo se conserva en `docs/product/module-registry.json`.

Si el registro marca `VISUAL_PENDING`, la implementación técnica existente se considera material adelantado/experimental y NO verdad de producto.

### Fuera del alcance actual

- corresponsales como entidad del sistema;
- cobertura de partidos/canchas;
- asignaciones de cobertura;
- estado LIVE;
- goles individuales;
- tarjetas/cambios/eventos;
- marcador derivado de eventos;
- cierre de serie/cobertura.

## Detector previo a implementar

Antes de escribir código de producto, responder:

```text
MÓDULO:
REQUISITO DECLARADO:
CONTEXTO QUE NO DEBE CONVERTIRSE EN REQUISITO:
ACTOR:
OBJETIVO HUMANO:
FUERA DE ALCANCE:
CONTRATO VISUAL:
VALIDACIÓN DE PRODUCTO:
DEPENDENCIAS CONSUMIBLES:
PROVENANCE:
OBSERVADO VS CANÓNICO:
```

Si `CONTRATO VISUAL` o `VALIDACIÓN DE PRODUCTO` está pendiente para un módulo human-facing, se bloquea la implementación funcional.

## Regla de reconstrucción

Ante un desvío descubierto después de implementar:

1. identificar la primera etapa cuya evidencia era inválida;
2. fijar el alcance y módulo correctos;
3. retroceder el módulo a su estado real en el registro;
4. bloquear dependencias;
5. conservar código/QA adelantado sólo como material experimental cuando aporte evidencia;
6. corregir primero el contrato visual/producto;
7. recién después reimplementar, QA, deploy y certificar consumibilidad.

## Decisión arquitectónica

Este documento y el `Consumable Module Gate` son gates obligatorios.

La regla práctica es:

> **Primero definir el módulo y la experiencia que una persona consumirá. Validarla. Implementarla. Certificarla. Sólo entonces construir lo que depende de ella.**
