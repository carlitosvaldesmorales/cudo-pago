# Domain Modeling Gate v1

Estado: ACTIVO
Ámbito: Fútbol Chépica / CUDO Sports Event Bus
Objetivo: impedir desvíos de arquitectura causados por modelar permisos, pantallas o flujos antes de entender correctamente al actor real del negocio.

## Invariante principal

Antes de diseñar permisos, UX o implementación, separar explícitamente:

**ORGANIZACIÓN ≠ IDENTIDAD ≠ ROL ≠ SCOPE ≠ ASIGNACIÓN ≠ ACCIÓN ≠ OBSERVACIÓN ≠ VERDAD CANÓNICA**

Ninguno de estos conceptos puede sustituir silenciosamente a otro.

## Orden obligatorio de modelado

Toda capacidad nueva o cambio relevante debe recorrer este orden:

1. **Dominio real** — qué problema/actividad existe en el mundo real.
2. **Topología de actores** — organizaciones, personas, sistemas y relaciones entre ellos.
3. **Persistencia** — qué existe de forma estable y qué es temporal.
4. **Scope y asignaciones** — dónde puede operar cada identidad y bajo qué encargo.
5. **Capacidades/autoridad** — qué puede hacer y qué NO puede hacer.
6. **Provenance y verdad** — quién observó, en representación de quién, y qué separa observación de estado canónico.
7. **UX/flujo** — cómo se expresa lo anterior en Telegram/Web/API.
8. **MOF+ sintético** — actor sintético representativo, Golden Path, contrato visual, fallos críticos y estado final verificable.
9. **Implementación/deploy**.

**No se salta un nivel para corregir el siguiente.** Si aparece información nueva que cambia un nivel anterior, se vuelve a ese nivel y se corrige desde la raíz.

## Domain Actor Fidelity Gate

Antes de aprobar un actor sintético o real, responder obligatoriamente:

- ¿Es una persona, organización, sistema o autoridad?
- ¿Actúa directamente o a través de múltiples personas/identidades?
- ¿Su existencia es permanente o depende de una asignación temporal?
- ¿Puede actuar simultáneamente en varios lugares/partidos?
- ¿Qué alcance tiene la organización y qué alcance tiene cada miembro?
- ¿Qué acciones son propias de la organización y cuáles de sus miembros?
- ¿Qué dato produce: observación, recomendación, decisión o verdad canónica?
- ¿Qué provenance mínimo debe conservarse para reconstruir quién hizo qué y en representación de quién?

Si una respuesta es desconocida y cambia el diseño, se declara **GAP** y se detiene esa parte del modelado. No se rellena por inferencia silenciosa.

## Regla de desvío

Si una entidad aparece actuando en muchos lugares mediante distintas personas, **no modelarla como usuario ni como permiso único**. Modelar primero:

```text
ORGANIZACIÓN
    ↓
MIEMBROS / IDENTIDADES
    ↓
ASIGNACIONES OPERACIONALES
    ↓
ACCIONES
    ↓
AGREGACIÓN / PROYECCIÓN
    ↓
GOBIERNO DE VERDAD CANÓNICA
```

## MOF+ elevado

Una capacidad no está suficientemente afinada sólo porque funcione.

Debe demostrar, como mínimo:

- actor sintético que represente correctamente la topología real del negocio;
- vertical end-to-end representativa;
- Golden Path;
- contrato visual/operacional coherente con el dominio;
- idempotencia/duplicado;
- callback o acción obsoleta;
- fuera de scope / autorización;
- estado final verificable;
- separación entre observación y estado canónico cuando corresponda.

El MOF+ **no crea una plataforma paralela de QA**. Se aplica como exigencia mínima a cada capacidad real.

## Ejemplo normativo: Chépica Play

Modelo incorrecto:

```text
Chépica Play = usuario/medio
    ↓
permiso por partido
    ↓
aporta resultado
```

Modelo correcto:

```text
CHÉPICA PLAY
organización concentradora permanente
        ↓
CORRESPONSALES
múltiples identidades humanas
        ↓
COBERTURAS / ASIGNACIONES
partido o cancha concreta
        ↓
GOLES OBSERVADOS
con actor + organización + cobertura
        ↓
RESULTADO OBSERVADO AGREGADO
        ↓
RECONCILIACIÓN
        ↓
RESULTADO CANÓNICO / OFICIAL
```

Invariantes específicos:

- Chépica Play tiene relación persistente a nivel campeonato.
- Sus corresponsales son miembros/identidades separadas.
- Una cobertura es una asignación operacional, no la identidad de Chépica Play.
- Cada gol conserva doble provenance: **actor humano + organización representada**, además de cobertura/partido/serie.
- El concentrador puede agregar observaciones de múltiples canchas.
- La observación de Chépica Play no se convierte silenciosamente en resultado oficial.
- La autoridad del campeonato conserva el gobierno del estado canónico.

## Detector previo a implementar

Antes de escribir código, responder en una frase por capa:

```text
DOMINIO:
TOPOLOGÍA DE ACTORES:
PERSISTENTE VS TEMPORAL:
SCOPE/ASIGNACIÓN:
CAPACIDADES:
PROVENANCE:
OBSERVADO VS CANÓNICO:
MOF+ REPRESENTATIVO:
```

Si una frase mezcla dos capas, el modelo todavía no está suficientemente afinado.

## Regla de reconstrucción

Ante un desvío descubierto después de implementar:

1. no parchear sólo UX o RBAC;
2. identificar qué capa anterior estaba mal modelada;
3. fijar el nuevo invariante;
4. corregir modelo/datos/contratos;
5. actualizar MOF+ para que el mismo error no vuelva a pasar;
6. recién entonces modificar runtime.

## Decisión arquitectónica

Este documento es un **gate obligatorio de modelado** para nuevas capacidades y para cambios que alteren actores, scopes, membresías, asignaciones, autoridad, provenance o verdad canónica.

La regla práctica es:

> **Primero modelar quién existe y cómo se relaciona; después qué puede hacer; recién entonces cómo se implementa.**
