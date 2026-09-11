## Módulo de producto

- Module ID:
- Estado actual:
- Estado objetivo:
- Actor consumidor:
- Objetivo humano:

## Contrato antes de implementar

- [ ] El requisito actual está separado de contexto/hipótesis.
- [ ] El módulo tiene frontera explícita.
- [ ] Si es human-facing, existe contrato visual completo.
- [ ] Si se pretende llegar a IMPLEMENTED o más, el contrato visual fue validado por producto.
- [ ] No se está usando código/QA existente como sustituto de la validación visual.

Evidencia del contrato visual / validación de producto:

## Dependencias

- Módulos de los que depende:
- [ ] Todos los módulos dependidos están `CONSUMABLE` en `docs/product/module-registry.json`.

## Implementación y QA

- [ ] La implementación corresponde al contrato aprobado.
- [ ] Golden Path probado.
- [ ] Duplicado/idempotencia probado.
- [ ] Acción stale/obsoleta probada cuando aplica.
- [ ] Autorización/scope negativo probado.
- [ ] Estado final verificable probado.
- [ ] No hay expansión de alcance por inferencia.

## Certificación

- [ ] Runtime desplegado coincide con el contrato aprobado.
- [ ] El consumidor puede completar la tarea sin conocimiento técnico.
- [ ] El registro de módulo fue actualizado al estado real.

> Regla: un PR técnico puede existir sin cerrar un módulo, pero no puede declarar progreso funcional ni habilitar dependencias mientras el módulo no sea `CONSUMABLE`.
