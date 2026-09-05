# HITO CUDO-QA-AUTO-01

Estado: MATERIALIZADO EN RAMA `cudo-qa-auto-01` / PENDIENTE AUTORIZACIÓN OAuth ÚNICA Y CERTIFICACIÓN

## Decisión de arquitectura

GitHub es la fuente de verdad del provisionador QA. Google Apps Script es el runtime. La operación recurrente no requiere copiar/pegar código ni ejecutar manualmente `provisionAllQA()`.

El proyecto `CUDO_WEB_FORMS_QA` se conserva: no se borra ni se recrea.

## Identidad Google confirmada

- Google Cloud project: `arke-cudo-core`
- Project number: `257090036200`
- OAuth desktop client: `cudo-os-desktop-sistemas`
- OAuth Client ID: `257090036200-mr8qoeglsklm8peu9s8mp8r9dcdphab4.apps.googleusercontent.com`
- Script ID: `1NI73jgr_PFvrsHy27ejE_kLbTWwLbM1Y8Nyc6mRaWlcCaLlZrpEB3Ud8`
- API executable deployment ID: `AKfycbzfvr6SZM7wZGMv0qCFrhWE-z-YpNbyxxyBy4DxJOMWyIvUNU8zkMLsJxau4h0SVIKWuw`

## Flujo recurrente

1. Cambio aprobado en `tools/google-forms-provisioner/`.
2. GitHub Actions obtiene un access token usando `CUDO_GOOGLE_REFRESH_TOKEN` + Client ID.
3. `projects.updateContent()` actualiza HEAD del Apps Script existente.
4. `projects.versions.create()` crea una versión inmutable.
5. `projects.deployments.update()` mueve el API executable estable a esa versión.
6. `scripts.run()` ejecuta `provisionAllQA`.
7. El runner valida Noticias, Equipos, Plantel, Partidos y Galería.
8. Cualquier error hace fallar el workflow.

## Bootstrap único pendiente

Se usa OAuth Desktop con PKCE. No se requiere recuperar ni almacenar `client_secret`.

GitHub necesita solo un secreto OAuth:

- `CUDO_GOOGLE_REFRESH_TOKEN`

El Client ID no es secreto y está fijado en el workflow.

El bootstrap local solicita estos scopes:

- `https://www.googleapis.com/auth/forms`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/script.projects`
- `https://www.googleapis.com/auth/script.deployments`

`bootstrap-oauth-local.js` abre Google, usa PKCE, captura el callback en localhost y carga el refresh token directamente a GitHub mediante `gh secret set`, sin imprimirlo.

## Componentes retirados del flujo activo

- `clasp`
- `CLASP_AUTH_JSON`
- Web App `ANYONE_ANONYMOUS`
- `CUDO_QA_AUTOMATION_TOKEN`
- `Automation.gs`
- `CUDO_GOOGLE_OAUTH_CLIENT_JSON`
- `CUDO_GOOGLE_OAUTH_TOKENS_JSON`
- almacenamiento de `client_secret`

## Regla de no retorno

No volver a usar como procedimiento recurrente:

`GitHub → copiar Code.gs → pegar en Apps Script → seleccionar provisionAllQA → Ejecutar`

Ese patrón queda permitido solo como emergencia controlada.

## Seguridad

- No existe endpoint Web App público para el provisionamiento.
- El runner apunta exclusivamente al Script ID existente.
- No crea ni elimina proyectos Apps Script.
- No ejecuta funciones PROD.
- La ejecución permitida en el workflow es `provisionAllQA`.
- El único secreto recurrente es el refresh token almacenado en GitHub Secrets.
- La autorización local usa PKCE y `state` para proteger el flujo OAuth.

## Criterio de cierre

El hito queda CERTIFICADO cuando un workflow `CUDO QA Forms Auto` termine SUCCESS y la respuesta de `scripts.run` confirme los cinco módulos QA sin errores.
