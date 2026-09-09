# CUDO WEB — LOGOS-03 / LOGOS-04 / LOGOS-05 — CIERRE

## Alcance cerrado
Integración de los 11 escudos individuales ya certificados en la vista **Partidos / Campeonato V8**, retiro del sistema legacy de sprites en esa vista, QA móvil/escritorio sobre producción y cierre del bloque de logos.

## Sitio certificado
https://cudo.cl/preview-v8/partidos/

## LOGOS-03 — Materialización en Partidos
Estado: **CERRADO**

Materializado:
- `preview-v8/partidos/index.html` ya no carga `championship-crests.css`.
- `preview-v8/partidos/index.html` ya no carga `crest-loader.js`.
- `preview-v8/shared/championship.js` usa rutas individuales bajo `preview-v8/media/clubes/`.
- CUDO / Unión Orilla usa exclusivamente el derivado web aprobado `union-orilla-web.png`.
- El activo oficial original `union-orilla.png` permanece separado e inmutable como fuente de identidad.
- `preview-v8/shared/championship.css` presenta los escudos con `object-fit: contain`, fondo transparente y sin el marco blanco del sprite antiguo.

## LOGOS-04 — QA producción
Estado: **CERRADO / CONFORME**

Workflow persistente:
`.github/workflows/validate-v8-partidos-logos.yml`

Run final exitoso:
https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34401353839

Commit certificado por el run:
`cf1e91c643d47949a5b744d1e5112c26e1c0fec3`

Artifact de evidencia:
https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34401353839/artifacts/10123573678

Artifact: `cudo-v8-logos-partidos-6`

SHA-256 artifact ZIP:
`98a19f3c360e0e61041592cb1b44f214ccbe9cd69658f6c5f4d911d64813e864`

Validaciones automáticas aprobadas:
1. Publicación LOGOS-03 visible en `cudo.cl`.
2. `championship-crests.css`: ausente de Partidos.
3. `crest-loader.js`: ausente de Partidos.
4. Los 11 PNG individuales: transporte HTTP válido.
5. Los 11 escudos aparecen al recorrer Fecha I–V y Grupos A/B.
6. No aparece fallback de escudo.
7. CUDO en su partido usa exactamente `union-orilla-web.png`.
8. Fecha I Grupo A: 3 enfrentamientos y 12 filas de serie.
9. Fecha I Grupo B: 2 enfrentamientos y 8 filas de serie.
10. Total Fecha I validado: 5 enfrentamientos con resultados oficiales y 20 filas de serie.
11. Playwright móvil 390×844: SUCCESS.
12. Playwright escritorio 1440×1000: SUCCESS.
13. Capturas completas y capturas del partido CUDO almacenadas en el artifact.

## Incidentes QA resueltos durante el cierre
Los fallos previos fueron del arnés de certificación, no evidencia de una regresión funcional del producto:
- Se esperaba erróneamente `20` objetos de resultado, pero el JSON público agrupa las 20 series en `5` enfrentamientos. El QA fue corregido para validar 5 enfrentamientos + 20 filas de serie.
- El QA tomaba el primer escudo del partido Santa Elena vs Unión Orilla, que corresponde al local. Se corrigió para seleccionar específicamente el `img` con identidad Unión Orilla.
- Se eliminó `loading="lazy"` de los escudos de partido para hacer la carga determinística al cambiar rápidamente Fecha/Grupo y evitar una falsa falla de imagen en QA.

## LOGOS-05 — Cierre
Estado: **CERRADO**

Autorización operativa del usuario:
- Instrucción explícita: **“materialízalo y ciérralo”**.
- Condición aplicada: cerrar sólo después de obtener QA producción verde y evidencia certificable.
- Condición cumplida: **SÍ**.

## Estado final del bloque de logos
- LOGOS-01 — activos individuales: **CERRADO**
- LOGOS-02 — Clubes + corrección visual CUDO: **CERRADO Y APROBADO**
- LOGOS-03 — integración Partidos: **CERRADO**
- LOGOS-04 — QA móvil/escritorio: **CERRADO / CONFORME**
- LOGOS-05 — cierre y persistencia: **CERRADO**

### BLOQUE LOGOS CUDO V8: **FINALIZADO**

## Regla de reapertura
Este bloque sólo se reabre si:
- el club entrega una nueva fuente oficial de identidad;
- un gate automático detecta regresión;
- el usuario formula una nueva observación visual explícita.

Fuera de esos casos, el siguiente trabajo debe avanzar al producto y no volver a rehacer logos.
