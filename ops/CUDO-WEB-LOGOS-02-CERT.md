# CUDO WEB — LOGOS-02 / CERTIFICACIÓN HUMANA

## Alcance
Certificación visual y técnica de la publicación de los escudos individuales en **Clubes V8**, con foco bloqueante en el escudo oficial de **Unión Orilla / C.U.D.O.**

## Sitio a certificar
https://cudo.cl/preview-v8/equipos/

## Estado histórico
La certificación visual anterior fue **RECHAZADA POR EL USUARIO** el 2026-09-09 porque el escudo CUDO se percibía como una imagen rectangular pegada sobre la tarjeta. Ese rechazo invalida el cierre visual anterior aunque el hash de la fuente oficial fuera correcto.

## Corrección de raíz materializada
- La fuente oficial permanece inmutable en `preview-v8/media/clubes/union-orilla.png`.
- SHA-256 fuente oficial: `2d3388c3567923006c06d57947ecc39eb418c6608cf79f98e0aee7aaa879ba53`.
- La presentación web usa un derivado separado: `preview-v8/media/clubes/union-orilla-web.png`.
- El derivado se genera de forma determinística con `tools/prepare-cudo-crest.py`.
- Pipeline persistente: `.github/workflows/prepare-cudo-crest.yml`.
- Propósito del derivado: eliminar únicamente el fondo blanco conectado al borde y ajustar el encuadre para web, sin redibujar ni generar la identidad con IA.
- `preview-v8/equipos/index.html` referencia `union-orilla-web.png` sólo para Unión Orilla.
- Regla de control visual persistente: `docs/VISUAL_CHANGE_CONTROL.md`.

## Evidencia previa rechazada
- Run anterior: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34383695251
- Artifact anterior: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34383695251/artifacts/10116876064
- Resultado humano: **RECHAZADO**.

## Evidencia nueva de la corrección de raíz
- Run QA producción: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34393372257
- Resultado del workflow: **SUCCESS**.
- Artifact nueva evidencia: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34393372257/artifacts/10120566083
- Artifact: `cudo-v8-certificacion-clubes-90`
- SHA-256 artifact ZIP: `350a7e1f45a9706bde25f78b34327d15ffea6494d19f78dbf5bf83cd09349c20`
- QA fuente oficial CUDO: **SUCCESS**.
- QA derivado web con transparencia: **SUCCESS**.
- QA Playwright móvil: **SUCCESS**.
- QA Playwright escritorio: **SUCCESS**.

## Estado actual
- Fuente oficial: **CONFORME**
- Corrección de presentación: **PUBLICADA EN MAIN Y CUDO.CL**
- Certificación técnica nueva: **CONFORME**
- Certificación visual humana: **PENDIENTE DE APROBACIÓN DEL CLUB**

## Regla de cierre
LOGOS-02 permanece **ABIERTO** hasta que el usuario/club revise la nueva evidencia o el sitio publicado y apruebe explícitamente la presentación visual del escudo CUDO.
