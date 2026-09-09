# CUDO WEB — TABLA-01 / TABLAS ANFA CHÉPICA 2026

## Alcance
Materializar tablas calculadas automáticamente desde resultados oficiales verificados del Campeonato ANFA Chépica 2026.

## Reglas persistidas
Fuente machine-readable: `preview-v8/data/anfa-chepica-2026-standings-rules.json`.

### Tabla General
Sólo suma Tercera + Segunda + Primera. Máximo 9 puntos por jornada:
- Tercera: gana 2, empata 1, pierde 0.
- Segunda: gana 3, empata 1, pierde 0.
- Primera: gana 4, empata 2, pierde 0.

Senior NO aporta a esta tabla.

### Tabla Senior
Competencia independiente:
- gana 3,
- empata 1,
- pierde 0.

## Criterio de desempate
Estado: **GAP**.
No existe criterio oficial documentado en las fuentes disponibles. No se usa diferencia de goles, goles a favor ni enfrentamiento directo por inferencia. Cuando hay igualdad de puntos se muestra posición compartida provisional.

## Arquitectura materializada
- Resultados: `preview-v8/data/anfa-chepica-2026-series-results.json`
- Fixture/grupos: `preview-v8/data/championship-fixture.json`
- Reglas: `preview-v8/data/anfa-chepica-2026-standings-rules.json`
- Cálculo dinámico: `preview-v8/shared/standings.js`
- Presentación responsive: `preview-v8/shared/standings.css`
- Publicación: `preview-v8/partidos/index.html#champStandings`
- QA persistente: `.github/workflows/validate-v8-standings.yml`

La tabla no contiene puntajes hardcodeados: se recalcula desde los resultados VERIFIED usando las reglas persistidas.

## Resultado actual con Fecha I verificada
### Grupo A — General
1. Peñarol La Mina — 9
2. Juventud de Chépica — 7
3. Santa Elena La Ruda — 5
4. Unión Orilla — 4
5. San Juan — 2
6. Independiente — 0

### Grupo A — Senior
Posición compartida 1: Unión Orilla, Peñarol La Mina y Juventud de Chépica — 3 pts.
Posición compartida 4: Santa Elena La Ruda, Independiente y San Juan — 0 pts.

### Grupo B — General
Posición compartida 1: Las Cruces y Huracán — 9 pts.
Posición compartida 3: San Agustín, Las Palmeras y San Ramón — 0 pts.

### Grupo B — Senior
1. Las Cruces — 3
Posición compartida 2: Huracán y Las Palmeras — 1 pt.
Posición compartida 4: San Agustín y San Ramón — 0 pts.

## Evidencia técnica
- Sitio: https://cudo.cl/preview-v8/partidos/#champStandings
- Run QA exitoso: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34402925899
- Artifact: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34402925899/artifacts/10124182362
- Artifact: `cudo-v8-tabla-anfa-2`
- SHA-256 artifact ZIP: `48be7d1e02cec11f8890f99e9b3f54c6b420696da058ab8707d7b34333aa0091`
- QA reglas: SUCCESS
- QA cálculo Grupo A/B: SUCCESS
- QA Tabla General/Senior separadas: SUCCESS
- QA CUDO con activo web aprobado: SUCCESS
- QA móvil/escritorio y capturas: SUCCESS

## Estado
- Materialización: **CONFORME**
- Cálculo: **CONFORME**
- QA técnico: **CONFORME**
- Certificación visual humana: **PENDIENTE**
- TABLA-01: **ABIERTO HASTA APROBACIÓN VISUAL**

## Regla de cierre
TABLA-01 se cierra cuando el usuario/club revise la tabla publicada y apruebe explícitamente su presentación. Si se define posteriormente un criterio oficial de desempate, se registra como nueva versión de reglas y se recalculan las posiciones.
