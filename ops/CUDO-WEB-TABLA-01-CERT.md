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

## Prioridad visual aprobada por el usuario
El total debe leerse antes que el detalle:
- Tabla General: `Pos. | Club | PJ | PTS | 3ª | 2ª | 1ª`
- Tabla Senior: `Pos. | Club | PJ | PTS | G | E | P`

Regla: `PTS` va inmediatamente después de `PJ`. En móvil, `PJ` y `PTS` deben quedar visibles juntos en la posición inicial de la tabla, sin que el usuario tenga que desplazar horizontalmente para descubrir el total. El desglose queda después y puede continuar hacia la derecha.

## Incidente de certificación 2026-09-09
La evidencia del usuario mostró que la versión visible en su iPhone seguía presentando el orden anterior `PJ | 3ª | 2ª | 1ª | PTS`, pese a que el QA previo había declarado conforme el cambio.

Causa de control: el QA anterior validaba el orden del DOM, pero no certificaba suficientemente que el renderer público exacto y la prioridad visual crítica (`PJ` + `PTS`) fueran visibles juntos en el viewport móvil inicial.

Corrección de raíz materializada:
1. cache-busting nuevo `20260909-tabla01c` para CSS y JS;
2. layout móvil con ancho explícito de columnas para que `PJ` y `PTS` queden juntos y visibles antes del detalle;
3. el workflow descarga y valida el `standings.js` y `standings.css` servidos realmente por `cudo.cl`;
4. Playwright mide `PJ` y `PTS` en móvil y falla si `PTS` no queda a la derecha de `PJ` y dentro de la tarjeta sin scroll;
5. capturas se toman con scroll horizontal en posición inicial.

La certificación run `34403652845` queda **SUPERADA / NO VÁLIDA COMO CERTIFICACIÓN VISUAL FINAL** para este requisito específico.

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

## Evidencia técnica vigente — TABLA-01C
- Sitio: https://cudo.cl/preview-v8/partidos/#champStandings
- Run QA exitoso: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34404397437
- Artifact: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34404397437/artifacts/10124743984
- Artifact: `cudo-v8-tabla-anfa-9`
- SHA-256 artifact ZIP: `4559f40d11a7dc4d35339758bb5cc5c07a8284676fa1c322a068aba9df9c408f`
- Renderer público exacto de `cudo.cl`: SUCCESS
- QA reglas: SUCCESS
- QA cálculo Grupo A/B: SUCCESS
- QA Tabla General/Senior separadas: SUCCESS
- QA orden General `PJ | PTS | 3ª | 2ª | 1ª`: SUCCESS
- QA orden Senior `PJ | PTS | G | E | P`: SUCCESS
- QA móvil `PJ + PTS` visibles juntos sin scroll: SUCCESS
- QA móvil/escritorio y capturas: SUCCESS

## Estado
- Materialización: **CONFORME**
- Cálculo: **CONFORME**
- Prioridad de columnas: **PUBLICADA Y QA CONFORME**
- Certificación visual humana TABLA-01C: **PENDIENTE**
- TABLA-01: **ABIERTO HASTA APROBACIÓN VISUAL FINAL**

## Regla de cierre
TABLA-01 se cierra cuando el usuario/club revise la versión TABLA-01C publicada y apruebe explícitamente su presentación. Si se define posteriormente un criterio oficial de desempate, se registra como nueva versión de reglas y se recalculan las posiciones.
