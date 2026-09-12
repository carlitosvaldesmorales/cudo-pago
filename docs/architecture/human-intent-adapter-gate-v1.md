# Human Intent → Adapter Gate v1

Estado: ACTIVO · 2026-09-12
Ámbito: capacidades humanas de Fútbol Chépica / CUDO.

## Propósito

Evitar que una UX sea derivada accidentalmente desde tablas, endpoints, callbacks o granularidad de persistencia. El sistema modela primero la intención y la unidad de trabajo humana; los canales son adaptadores de esa capacidad.

## Secuencia obligatoria

```text
INTENCIÓN HUMANA
  → UNIDAD DE TRABAJO HUMANA
  → CAPACIDAD CANÓNICA
  → ESTADO DE DOMINIO
  → POLICY / AUTORIDAD
  → ADAPTADOR DE CANAL
  → PERSISTENCIA / EVENTOS / PROYECCIONES
```

No se permite invertir esta secuencia para diseñar la interacción.

## Invariantes

1. `HUMAN_WORK_UNIT_NEQ_PERSISTENCE_UNIT`: la unidad que comprende la persona puede ser mayor que la fila/registro que se persiste.
2. `INTENT_BEFORE_ADAPTER`: Telegram, Web, API o cualquier canal representa la capacidad; no define su semántica.
3. `HUMAN_CONTEXT_PERSISTS_ACROSS_FIELD_CAPTURE`: al capturar campos internos de una unidad humana, el contexto principal debe permanecer visible/recuperable sin obligar a reiniciar la navegación.
4. `POLICY_NEQ_FLOW`: identidad, autoridad, provenance y estado posterior no crean flujos de captura paralelos.
5. `TRANSACTIONAL_CHAT_SINGLE_LIVE_SURFACE_WHEN_SUPPORTED`: un adaptador conversacional con edición de mensajes debe reutilizar una superficie viva durante una transacción en vez de producir un transcript de pasos internos.
6. `PERSIST_EARLY_WITHOUT_CHANGING_HUMAN_UNIT`: persistir subunidades confirmadas no obliga a fragmentar la experiencia humana.

## Aplicación obligatoria a RESULTS-REGISTER

| Capa | Unidad |
|---|---|
| Intención | Completar resultados de un partido |
| Unidad humana | `MATCH` |
| Persistencia | `MATCH + SERIES` |
| Captura interna | `HOME_SCORE`, `AWAY_SCORE` |
| Autoridad | policy posterior a confirmación |
| Proyección | `reported` / `official` |
| Adaptador inicial | Telegram |

Por lo tanto, una persona entra a un partido y permanece en ese partido mientras completa 3ª, 2ª, Senior y 1ª. Confirmar una serie persiste esa serie y vuelve al tablero del mismo partido. La persona decide cuándo terminar la carga del partido.

## Regla de no regresión

Un cambio no puede volver a convertir `SERIES`, `HOME_SCORE`, `AWAY_SCORE` o una tabla de base de datos en la unidad primaria de navegación. Las pruebas deterministas deben fallar si el Golden Path vuelve a acumular mensajes de Telegram en cada paso o si una confirmación de serie abandona el partido.
