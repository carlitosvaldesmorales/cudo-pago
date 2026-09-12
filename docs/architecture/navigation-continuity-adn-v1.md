# ADN de continuidad de navegación — v1

Estado: CANÓNICO
Fecha: 2026-09-12
Canal principal: **@FutbolChepicaBot**

## Causa raíz

El producto tenía navegación funcional pero no una semántica única de navegación. Algunas pantallas usaban `Salir`, `Inicio` o botones de otra audiencia para resolver lo que en realidad era una acción **Volver**. Eso obligaba al usuario a reconstruir manualmente el camino por el que había entrado.

La corrección no es cambiar una palabra: el sistema debe conservar el **contexto de audiencia** mientras la persona navega por capacidades compartidas.

```text
PERSONA
  ↓
AUDIENCIA ACTIVA
  ├─ Público general
  ├─ Dirigentes
  └─ Chépica Play
       ↓
CAPACIDAD
       ↓
SUBPANTALLAS
```

## Semántica canónica

### ⬅️ Volver

- regresa al padre inmediato;
- no concede ni revoca permisos;
- no destruye el contexto de audiencia;
- no cancela trabajo confirmado;
- en la raíz de una capacidad compartida regresa a la audiencia que abrió esa capacidad.

### ❌ Cancelar

- existe sólo cuando hay una operación o borrador no confirmado;
- descarta únicamente ese trabajo no confirmado;
- después regresa al padre inmediato;
- no abandona la audiencia.

### ✅ Terminar

- cierra deliberadamente una tarea completada;
- conserva lo ya confirmado;
- regresa al nivel operativo padre o al home de la audiencia según el contrato de la tarea;
- nunca equivale a `Inicio`.

### 🏠 Inicio

- es una salida explícita del contexto actual;
- vuelve a la raíz `Público general / Dirigentes / Chépica Play`;
- es la única acción de navegación que puede limpiar el contexto de audiencia.

## Invariantes

`BACK_RETURNS_TO_IMMEDIATE_PARENT`

`BACK_NEVER_MEANS_HOME`

`BACK_DOES_NOT_DESTROY_AUDIENCE_CONTEXT`

`CANCEL_ONLY_DISCARDS_UNCONFIRMED_WORK`

`FINISH_CLOSES_TASK_WITHOUT_EXITING_AUDIENCE`

`HOME_IS_EXPLICIT_CONTEXT_EXIT`

`SHARED_CAPABILITY_RETURNS_TO_ORIGIN_AUDIENCE`

`AUDIENCE_CONTEXT_NEQ_AUTHORIZATION`

Conservar `CHEPICA_PLAY`, `DIRIGENTES` o `PUBLIC_GENERAL` es estado de navegación, no una autorización. Cada capacidad sigue comprobando su policy real.

## Aplicación a Chépica Play

```text
🎥 Chépica Play
   ↓
📝 Ingresar resultados
   ↓
Fecha III
   ↓
Partido
   ↓
Serie
```

La vuelta natural es:

```text
Serie      → Partido
Partido    → Fecha III
Fecha III  → Fechas
Fechas     → Chépica Play
```

No existe un `Salir` que obligue a volver a Inicio y entrar nuevamente a Chépica Play.

## Capacidades compartidas

Resultados públicos pueden ser abiertos desde más de una audiencia. La salida de esa capacidad no puede estar codificada como `Público`.

```text
Chépica Play → Consultar resultados → ⬅️ Volver → Chépica Play
Público      → Resultados           → ⬅️ Volver → Público
Dirigentes   → vista compartida     → ⬅️ Volver → Dirigentes
```

El callback canónico `nav:back` resuelve el home de la audiencia activa.

## Compatibilidad

Callbacks históricos como `rr:cancel-menu` y `p3:public` se aceptan para mensajes antiguos, pero se reinterpretan como **Volver al contexto de origen**. No deben volver a emitirse en superficies nuevas.

## Definition of Done

Una navegación humana sólo se considera consumible cuando:

- cada pantalla conoce su padre semántico;
- `Volver`, `Cancelar`, `Terminar` e `Inicio` tienen significados distintos;
- una capacidad compartida vuelve a la audiencia de origen;
- no hay botones nuevos `❌ Salir`;
- volver un paso no borra valores ya capturados salvo que el usuario pulse explícitamente `Cancelar` o `Cambiar`;
- QA determinista valida el contrato;
- una prueba humana confirma la continuidad real en Telegram.
