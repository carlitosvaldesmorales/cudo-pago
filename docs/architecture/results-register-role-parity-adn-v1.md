# Results Register — Role Parity ADN v1

## Problema observado

La captura de resultados había evolucionado en dos experiencias: el registro canónico `rr:*`, centrado en partido/serie y selección por botones, y una captura histórica de administración global `ga:*` que pedía escribir `LOCAL-VISITA`. La identidad del usuario estaba eligiendo la implementación de UX, cuando sólo debía determinar alcance y autoridad.

## Invariante canónico

`ONE_RESULT_CAPTURE_CAPABILITY_ALL_IDENTITIES`

Agregar un resultado es una sola capacidad de producto. Público general, colaboradores, CLUB_ADMIN, PLATFORM_OPERATOR y SUPER_ADMIN consumen el mismo RESULTS-REGISTER canónico. El rol no selecciona otro formulario ni otro flujo de captura.

`ROLE_CHANGES_SCOPE_AND_AUTHORITY_NOT_CAPTURE_UX`

La identidad modifica únicamente:

- qué partidos puede ver o seleccionar;
- si el dato queda como aporte pendiente u oficial;
- la procedencia/auditoría de la operación;
- qué acciones de gobierno puede ejecutar después.

No modifica el mecanismo humano de captura: fecha → partido → serie → marcador local → marcador visita → confirmar.

## Compatibilidad

`tp:mymatches` y superficies históricas pueden seguir aceptándose para mensajes antiguos, pero deben converger al RESULTS-REGISTER canónico antes de cualquier fallback legado. Ninguna superficie nueva de Dirigentes puede emitir `tp:mymatches` para registrar resultados.

Los callbacks `ga:*` quedan como compatibilidad de mensajes históricos y gobierno existente; no constituyen la entrada canónica para agregar un nuevo resultado.

## Separación de gobierno

Registrar por primera vez un resultado y gobernar/corregir un resultado oficial existente son capacidades distintas. Un SUPER_ADMIN usa la misma captura canónica para el primer registro, pero las correcciones, disputas, anulaciones e historial permanecen bajo el plano de gobierno de resultados.

## Criterio de aceptación

- CLUB_ADMIN y SUPER_ADMIN reciben `rr:dates` desde sus superficies nuevas de Dirigentes.
- Un callback histórico `tp:mymatches` es normalizado a `rr:dates`.
- SUPER_ADMIN ve el alcance completo de la competencia, pero usa el mismo selector de marcador por botones.
- CLUB_ADMIN conserva su scope de club usando exactamente la misma UX.
- Público/operadores siguen entrando al mismo register y la policy decide el outcome.
- Ninguna pantalla nueva de captura solicita escribir `LOCAL-VISITA`.
