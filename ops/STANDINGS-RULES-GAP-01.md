# STANDINGS-RULES-GAP-01

Fecha: 2026-09-10
Estado: **GAP DE FUENTE / NO IMPLEMENTAR TABLA HASTA RESOLVER**

## Objetivo bloqueado

Construir una tabla de posiciones automática y pública para `ANFA-CHEPICA-2026` a partir de los resultados oficiales por serie ya gobernados en `match_series_results`.

## Evidencia técnica actual

- `preview-v8/data/tabla.json` existe pero `items` está vacío.
- El repositorio no contiene una regla explícita de puntaje o desempate para ANFA Chépica 2026.
- El campeonato vigente maneja cuatro series: Tercera, Segunda, Senior y Primera.
- El nuevo read model público del campeonato ya entrega únicamente resultados publicables por serie, por lo que existe una fuente técnica segura para calcular una tabla una vez conocidas las reglas.

## Fuentes revisadas

### Repositorio CUDO / Fútbol Chépica

Búsqueda de `puntos`, `desempate`, `diferencia de gol`, `tabla de posiciones`, `standings`, `3 puntos` y equivalentes: no apareció una definición normativa aplicable a `ANFA-CHEPICA-2026`.

### Archivos disponibles del usuario

Se encontró `Bases Octagonal Febrero 2025 CUDO Final 2.pdf`, que define para ESE torneo CUDO 2025 una ponderación particular por serie (Segunda y Senior 3 puntos; Primera 6 puntos) y un mecanismo de definición por penales. Ese documento corresponde a otro torneo, otra fecha y otra estructura de series. Se clasifica como **NO APLICABLE** a ANFA Chépica 2026 salvo que exista una fuente oficial que declare lo contrario.

No se encontró en la biblioteca disponible un documento titulado o identificado como bases/reglamento específico del Campeonato ANFA Chépica 2026.

### Web pública

Se localizaron reglamentos generales ANFA y ARFA Sexta, pero no una publicación pública indexada que defina el sistema de puntaje y desempate específico del campeonato local ANFA Chépica 2026. También se buscaron combinaciones de ANFA Chépica 2026 + bases/reglamento/tabla/puntos/desempate y no apareció una fuente oficial suficiente.

## Por qué no se debe inferir

No es seguro asumir automáticamente:

- victoria = 3, empate = 1, derrota = 0;
- que las cuatro series tengan el mismo valor;
- que la tabla sea una tabla por serie o un acumulado por club;
- que Primera tenga o no ponderación distinta;
- que el primer desempate sea diferencia de gol;
- que el segundo desempate sea goles a favor, resultado entre sí, penales u otro criterio;
- cómo afectan WO, sanciones administrativas, anulaciones o resultados en disputa.

Una de esas suposiciones podría producir una tabla matemáticamente consistente pero reglamentariamente falsa.

## Datos mínimos que debe entregar una fuente autorizada

1. ¿La clasificación es por club acumulando las cuatro series, o existe una tabla separada por serie?
2. Puntos de victoria, empate y derrota para Tercera, Segunda, Senior y Primera.
3. Orden completo de criterios de desempate.
4. Regla para WO/no presentación y marcador reglamentario asociado, si existe.
5. Tratamiento de sanciones con pérdida de puntos.
6. Si una serie `DISPUTED` se excluye totalmente del cálculo hasta resolución.
7. Si una serie `ANNULLED` se excluye o se reemplaza por un resultado administrativo.
8. Cualquier bonificación, ponderación o regla especial por serie/fase.

## Condición de desbloqueo

Aceptar como fuente una de estas dos evidencias:

- las bases/reglamento oficial de ANFA Chépica 2026; o
- una confirmación explícita de la Asociación/organización que defina los ocho puntos anteriores.

Hasta entonces, el sistema puede seguir mostrando fixture y resultados oficiales por serie, pero **no debe calcular ni publicar una tabla de posiciones automática**.

## Próximo paso una vez resuelto

Con la regla normativa disponible se puede implementar sin más captura manual:

`match_series_results VERIFIED -> motor de standings determinista -> /api/v1/public-standings -> V8`

El cálculo debe ser reconstruible desde los resultados oficiales y testeado con fixtures de empate, WO, sanción, disputa y anulación antes de publicarse.
