# Domain Modeling Gate v1

Estado: ACTIVO
Ámbito: Fútbol Chépica / CUDO Sports Event Bus
Objetivo: impedir desvíos de arquitectura causados por convertir contexto, inferencias o posibilidades futuras en requisitos actuales.

## Invariantes principales

Antes de diseñar permisos, UX o implementación, separar explícitamente:

**ORGANIZACIÓN ≠ IDENTIDAD ≠ ROL ≠ SCOPE ≠ ASIGNACIÓN ≠ ACCIÓN ≠ OBSERVACIÓN ≠ VERDAD CANÓNICA**

Y, por encima de todo:

**CONTEXTO ≠ REQUISITO**

Que sepamos cómo una organización trabaja en el mundo real no autoriza a incorporar esa operación al producto. Una capacidad entra en arquitectura sólo cuando ha sido declarada como requisito actual o aceptada explícitamente como parte del alcance.

## Gate de alcance antes del modelado

Antes de recorrer la topología del dominio, clasificar cada dato en una de estas categorías:

- **REQUISITO DECLARADO**: capacidad que debe existir ahora. Puede entrar al diseño.
- **CONTEXTO**: información que ayuda a entender al actor, pero no crea funciones del producto.
- **HIPÓTESIS / POSIBLE EVOLUCIÓN**: opción futura. No se implementa.
- **GAP**: falta una decisión que puede cambiar el diseño. Se detiene sólo esa parte.

Una inferencia nunca puede ascender de CONTEXTO/HIPÓTESIS a REQUISITO sin validación explícita.

## Orden obligatorio de modelado

Toda capacidad nueva o cambio relevante debe recorrer este orden:

1. **Alcance declarado** — qué capacidad se pidió realmente y qué queda fuera.
2. **Dominio real necesario** — sólo la parte del mundo real necesaria para esa capacidad.
3. **Topología de actores necesaria** — únicamente actores/relaciones requeridos por el alcance actual.
4. **Persistencia** — qué debe existir establemente para soportar el requisito.
5. **Scope/asignación** — sólo si el requisito necesita restricciones operacionales de alcance.
6. **Capacidades/autoridad** — qué puede hacer y qué NO puede hacer.
7. **Provenance y verdad** — quién aportó el dato y qué lo separa del estado canónico.
8. **UX/flujo** — cómo se expresa lo anterior en Telegram/Web/API.
9. **MOF+ sintético** — actor representativo del requisito, Golden Path, contrato visual, fallos críticos y estado final verificable.
10. **Implementación/deploy**.

**No se agrega una capa sólo porque exista en el mundo real.** Si no es necesaria para la capacidad declarada, queda fuera del modelo actual.

## Domain Actor Fidelity Gate

Antes de aprobar un actor sintético o real, responder:

- ¿Qué capacidad declarada estamos representando?
- ¿Qué información sobre este actor es requisito y cuál es sólo contexto?
- ¿Es una persona, organización, sistema o autoridad para efectos de esta capacidad?
- ¿Qué acciones necesita realizar ahora?
- ¿Qué acciones sabemos que realiza en el mundo real pero NO forman parte del producto actual?
- ¿Qué dato produce: observación, recomendación, decisión o verdad canónica?
- ¿Qué provenance mínimo necesita el requisito actual?

Sólo si una relación adicional es necesaria para cumplir la capacidad declarada se modelan miembros, asignaciones u otras capas.

Si una respuesta desconocida cambia el requisito actual, se declara **GAP** y se detiene esa parte. No se rellena por inferencia silenciosa.

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

Esos conceptos sólo se incorporan si existe un requisito actual que los necesite.

## MOF+ elevado

Una capacidad no está suficientemente afinada sólo porque funcione.

Debe demostrar, como mínimo:

- actor sintético que represente correctamente **el alcance declarado**, no todo el contexto conocido;
- vertical end-to-end representativa;
- Golden Path;
- contrato visual/operacional coherente con el requisito;
- idempotencia/duplicado;
- callback o acción obsoleta cuando aplique;
- fuera de scope / autorización;
- estado final verificable;
- separación entre observación y estado canónico cuando corresponda.

El MOF+ **no crea una plataforma paralela de QA** y tampoco expande el producto para hacer la simulación más realista de lo solicitado.

## Ejemplo normativo: Chépica Play

Contexto conocido:

- es una plataforma/medio de transmisión;
- puede concentrar información obtenida por su operación interna;
- puede existir personal distribuido en terreno.

Ese contexto NO define el producto actual.

### Requisito actual declarado

Chépica Play tiene exactamente dos capacidades:

```text
CHÉPICA PLAY
    ├── CONSUMIR RESULTADOS
    └── REGISTRAR RESULTADOS
```

Por lo tanto, el modelo actual correcto es:

```text
IDENTIDAD VINCULADA A CHÉPICA PLAY
        │
        ├── READ_COMPETITION
        │      └── consultar resultados
        │
        └── OBSERVE_RESULT
               └── registrar marcador de partido/serie
                         ↓
                RESULTADO INFORMADO
                         ↓
                REVISIÓN / GOBIERNO
                         ↓
                RESULTADO CANÓNICO
```

### Fuera del alcance actual

- corresponsales como entidad del sistema;
- cobertura de partidos/canchas;
- asignaciones de cobertura;
- estado LIVE;
- goles individuales;
- tarjetas/cambios/eventos;
- marcador derivado de eventos;
- cierre de serie/cobertura.

El hecho de que alguno exista en la operación real de Chépica Play no lo convierte en requisito.

### Invariantes específicos

- El vínculo es persistente a nivel campeonato.
- La capacidad de lectura es `READ_COMPETITION`.
- La capacidad de registro es `OBSERVE_RESULT`.
- `PUBLISH_MATCH_EVENT` no pertenece al contrato actual de Chépica Play.
- Registrar un resultado crea una observación/aporte con provenance `Chépica Play`.
- El aporte no sobrescribe automáticamente el resultado canónico.
- Chépica Play no recibe gobierno de resultados ni autoridad de política por este vínculo.

## Detector previo a implementar

Antes de escribir código, responder en una frase por capa:

```text
REQUISITO DECLARADO:
CONTEXTO QUE NO DEBE CONVERTIRSE EN REQUISITO:
ACTOR NECESARIO:
CAPACIDADES ACTUALES:
FUERA DE ALCANCE:
PROVENANCE:
OBSERVADO VS CANÓNICO:
MOF+ REPRESENTATIVO:
```

Si una línea introduce una capacidad que no aparece en `REQUISITO DECLARADO`, el cambio se bloquea antes de implementación.

## Regla de reconstrucción

Ante un desvío descubierto después de implementar:

1. identificar qué contexto/inferencia fue promovido erróneamente a requisito;
2. fijar el alcance declarado correcto;
3. retirar del runtime las capacidades adelantadas;
4. preservar evidencia histórica cuando corresponda, pero desactivar su efecto operacional;
5. corregir modelo de autorización, datos, UX y contratos;
6. actualizar MOF+ para demostrar tanto el Golden Path correcto como que los flujos retirados fallan cerrados;
7. desplegar sólo después de validación.

## Decisión arquitectónica

Este documento es un **gate obligatorio de alcance y modelado** para nuevas capacidades y cambios relevantes.

La regla práctica es:

> **Primero separar requisito de contexto. Después modelar sólo lo necesario para el requisito. Recién entonces implementar.**
