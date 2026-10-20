# RESULTS-GOVERN · Aprobación de producto Secretaría · 2026-10-20

Estado: **APROBADO PARA IMPLEMENTACIÓN**

## Necesidad declarada

El usuario solicitó que los reclamos resueltos por Secretaría puedan ejecutarse vía Telegram y que sus efectos se reflejen en la tabla de posiciones.

Los tres casos operativos declarados para esta primera versión son:

1. San Juan vs Juventud de Chépica · Segunda: Juventud presentó carnet vencido; los puntos obtenidos por Juventud se restan y se suman a San Juan.
2. Juventud de Chépica vs Independiente · Tercera: los puntos obtenidos por Juventud se restan y se suman a Independiente.
3. Santa Elena La Ruda vs Juventud de Chépica · Segunda: los puntos obtenidos por Juventud se restan y se suman a Santa Elena La Ruda.

## Decisión de producto

1. La resolución administrativa vive dentro de `RESULTS-GOVERN`; no se crea un módulo paralelo.
2. El flujo parte desde Partido → Serie dentro de Gobierno de resultados.
3. La acción de escritura queda limitada inicialmente a `SUPER_ADMIN` verificado.
4. El sistema calcula el monto a transferir desde el marcador y las reglas de puntuación vigentes.
5. El monto es el puntaje realmente obtenido por el club sancionado, incluso cuando es un empate de 1 punto.
6. La resolución exige motivo y confirmación explícita.
7. El marcador histórico no cambia.
8. El impacto en tabla se materializa mediante `standings_adjustments`.
9. La tabla pública sigue teniendo una sola autoridad: `public-standings-v2`.
10. Se bloquean duplicados y cambios concurrentes.

Contrato vinculante: `docs/product/results-govern-secretariat-visual-contract-v1.md`.
