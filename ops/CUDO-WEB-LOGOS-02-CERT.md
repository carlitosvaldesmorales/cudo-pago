# CUDO WEB — LOGOS-02 / CERTIFICACIÓN HUMANA

## Alcance
Certificación visual y técnica de la publicación de los escudos individuales en **Clubes V8**, con foco bloqueante en el escudo oficial de **Unión Orilla / C.U.D.O.**

## Sitio a certificar
https://cudo.cl/preview-v8/equipos/

## Evidencia técnica materializada
- Workflow: **CUDO V8 - certificar producción cudo.cl**
- Run exitoso: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34383695251
- Artifact visual descargable: https://github.com/carlitosvaldesmorales/cudo-pago/actions/runs/34383695251/artifacts/10116876064
- Artifact: `cudo-v8-certificacion-clubes-84`
- SHA-256 del artifact ZIP: `b77f7c4ea64ffe9cecd24536cdf064fdbe81bcc82399792ad48f20cce7807aa6`

## Validaciones automáticas aprobadas
1. La publicación actual de `Clubes` está visible en `cudo.cl`.
2. Los 11 escudos son PNG individuales accesibles desde producción.
3. El PNG publicado de C.U.D.O. / Unión Orilla tiene exactamente el SHA-256 aprobado:
   `2d3388c3567923006c06d57947ecc39eb418c6608cf79f98e0aee7aaa879ba53`
4. QA Playwright móvil: **SUCCESS**.
5. QA Playwright escritorio: **SUCCESS**.
6. Evidencia visual generada y almacenada: `clubes-mobile.png`, `clubes-desktop.png`, `logos/cudo-mobile.png`, `logos/cudo-desktop.png`, `visual-report.json`, `CERTIFICADO.txt`.

## Estado
- Certificación técnica: **CONFORME**
- Certificación humana: **PENDIENTE DE APROBACIÓN DEL CLUB**

## Regla de cierre
LOGOS-02 sólo se considera cerrado cuando la persona responsable revise el sitio y/o las capturas del artifact y apruebe explícitamente la presentación visual.
