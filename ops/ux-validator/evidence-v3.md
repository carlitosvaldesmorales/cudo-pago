# Evidencia UX — Telegram resultados V3

## Fuente humana

- V2 funcional: PASS.
- V2 integridad de datos: PASS.
- V2 aceptación UX: RECHAZADA.
- Feedback literal de la prueba iOS de V2: “Ahora siento que es más carga cognitiva”.
- Observación de la captura V2: al navegar quedaban visibles paneles anteriores y sus botones.

## Problemas demostrados que V3 debe atacar

1. `MESSAGE_ACCUMULATION`: la navegación V2 crea mensajes/paneles nuevos en vez de reutilizar el panel actual.
2. `PRIMARY_PATH_COMPLEXITY`: V2 obliga a decidir primero entre última fecha / fecha / club / serie antes de llegar al contenido principal.

## Contrato de V3 candidato

- La entrada `Resultados verificados` debe ir directamente a la última fecha con resultados.
- Dentro del flujo V3, los callbacks deben editar el mismo mensaje con `editMessageText`; `sendMessage` sólo puede ser fallback excepcional si Telegram no permite editar.
- Los filtros fecha / club / serie deben quedar detrás de una única acción secundaria `Otros resultados`.
- Un partido completo no debe mostrar ruido `4/4`; sólo se muestra advertencia si faltan series verificadas.
- Los callbacks históricos `px:*` de V2 deben seguir funcionando durante la transición.
- El bot primario `@CUDODeportesBot` debe permanecer sin cambios como rollback.

## Estado de aceptación

- Aceptación técnica/determinista de V3: pendiente del CI.
- Revisión por agentes open-source: pendiente del CI.
- Aceptación humana V3 en Telegram iOS: PENDIENTE. No puede declararse PASS sin prueba real.
