# Capability Supersession Absorption ADN v1

Estado: CANÓNICO
Fecha: 2026-09-23

## Problema observado

Una superficie nueva puede reemplazar correctamente a una superficie anterior y aun así degradar el producto si no absorbe todas las capacidades válidas que el actor podía alcanzar desde la superficie sustituida.

Caso observado: el nuevo Home canónico de Dirigentes pasó a resolver `tp:leaders` antes que el dashboard global histórico. La precedencia era intencional y estaba probada, pero el nuevo Home de `SUPER_ADMIN` no había absorbido dos capacidades ya materializadas y autorizadas: revisión de resultados pendientes y gobierno de resultados.

## Invariante

`SUPERSESSION_REQUIRES_CAPABILITY_ABSORPTION`

Una superficie, router, menú, formulario, API, agente o workflow que sustituye a otro no puede declararse consumible sólo porque el sucesor funciona. Debe demostrar qué capacidades válidas del predecesor:

- fueron absorbidas por el sucesor;
- fueron trasladadas a una ruta humana equivalente y alcanzable;
- fueron retiradas mediante una decisión explícita;
- o quedaron bloqueadas por un GAP declarado.

`ROUTING_PRECEDENCE_MUST_NOT_HIDE_AUTHORIZED_CAPABILITIES`

Si un handler nuevo intercepta una entrada antes que un handler anterior, la composición completa debe conservar las capacidades autorizadas del actor. La prueba unitaria aislada de ambos handlers no es suficiente.

`ROLE_CAPABILITY_NEQ_VISIBLE_ENTRYPOINT`

Que RBAC declare una capacidad no demuestra que una persona pueda utilizarla. Toda capacidad humana materializada requiere una ruta visible o navegable desde la superficie canónica de su rol.

`CAPABILITY_PRESENT_NEQ_CAPABILITY_REACHABLE`

Código, base de datos y handlers pueden existir y pasar QA de forma aislada mientras la capacidad permanece inaccesible en el viaje real.

`CANONICAL_CAPTURE_HANDS_OFF_EXISTING_FACT_TO_GOVERNANCE`

Registrar un hecho nuevo y gobernar un hecho existente son capacidades distintas. Cuando la captura canónica detecta un resultado ya gobernado y el actor posee autoridad global, debe entregar continuidad directa al plano de gobierno en vez de terminar en un estado informativo sin acción.

## Contrato SUPER_ADMIN vigente para resultados

Desde la superficie canónica Dirigentes / Admin Global deben ser alcanzables, como mínimo:

- solicitudes de acceso;
- resultados pendientes de revisión;
- administración de dirigentes;
- registro canónico de resultados con alcance global;
- gobierno de resultados existentes;
- resultados registrados.

El registro canónico conserva una sola UX para todas las identidades. El rol cambia alcance y autoridad, no la captura.

## Gate de aceptación

Una sustitución de superficie sólo pasa cuando:

1. se identifica el predecesor alcanzado por la misma intención humana;
2. se enumeran sus capacidades válidas;
3. se comparan con la matriz de autorización vigente;
4. cada capacidad queda `ABSORBED`, `MOVED`, `RETIRED_BY_DECISION` o `GAP`;
5. la composición real de routers se prueba desde la entrada humana;
6. un actor representativo puede navegar hasta cada capacidad absorbida;
7. una capacidad compartida conserva handoff hacia el plano correcto cuando el estado cambia.

## Regla de anti-desvío

No se corrige una regresión de supersesión agregando sólo el botón reportado por el usuario. Primero se reconcilia el conjunto de capacidades del actor contra la superficie sucesora y se protege con un gate ejecutable.
