# HITO CUDO-QA-AUTO-01

Estado: MATERIALIZADO EN RAMA `cudo-qa-auto-01` / PENDIENTE CERTIFICAR OAuth EN GITHUB

## Decisión de arquitectura

GitHub es la fuente de verdad del provisionador QA. Google Apps Script es el runtime. La operación recurrente no requiere copiar/pegar código ni ejecutar manualmente `provisionAllQA()`.

Se reutiliza el patrón OAuth real de `arke-os-root`, pero el proyecto `CUDO_WEB_FORMS_QA` se conserva: no se borra ni se recrea.

## Identidad Google confirmada

- Google Cloud project: `arke-cudo-core`
- Project number: `257090036200`
- Script ID: `1NI73jgr_PFvrsHy27ejE_kLbTWwLbM1Y8Nyc6mRaWlcCaLlZrpEB3Ud8`
- API executable deployment ID: `AKfycbzfvr6SZM7wZGMv0qCFrhWE-z-YpNbyxxyBy4DxJOMWyIvUNU8zkMLsJxau4h0SVIKWuw`

## Flujo recurrente

1. Cambio aprobado en `tools/google-forms-provisioner/`.
2. GitHub Actions ejecuta `runner.js` con OAuth del usuario CUDO.
3. `projects.updateContent()` actualiza HEAD del Apps Script existente.
4. `projects.versions.create()` crea una versión inmutable.
5. `projects.deployments.update()` mueve el API executable estable a esa versión.
6. `scripts.run()` ejecuta `provisionAllQA`.
7. El runner valida Noticias, Equipos, Plantel, Partidos y Galería.
8. Cualquier error hace fallar el workflow.

## Bootstrap único pendiente

GitHub requiere dos secretos OAuth, configurados una sola vez:

- `CUDO_GOOGLE_OAUTH_CLIENT_JSON`
- `CUDO_GOOGLE_OAUTH_TOKENS_JSON`

El token debe pertenecer al OAuth Client de `arke-cudo-core` y cubrir los permisos necesarios para administrar el proyecto/deployment y ejecutar los scopes del script.

No se guardan `client_secret`, `refresh_token` ni `access_token` en el repositorio.

## Componentes retirados del flujo activo

Ya no forman parte de la arquitectura recurrente:

- `clasp`
- `CLASP_AUTH_JSON`
- Web App `ANYONE_ANONYMOUS`
- `CUDO_QA_AUTOMATION_TOKEN`
- `Automation.gs`

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
- Los secretos OAuth viven únicamente en GitHub Secrets.

## Criterio de cierre

El hito queda CERTIFICADO cuando un workflow `CUDO QA Forms Auto` termine SUCCESS y la respuesta de `scripts.run` confirme los cinco módulos QA sin errores.
