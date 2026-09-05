# HITO CUDO-QA-AUTO-01

Estado: MATERIALIZADO EN RAMA `cudo-qa-auto-01`

## Decisión de arquitectura

GitHub es la fuente de verdad del provisionador QA. Google Apps Script es el runtime. La operación recurrente no requiere copiar/pegar código ni ejecutar manualmente `provisionAllQA()`.

## Flujo recurrente

1. Cambio aprobado en `tools/google-forms-provisioner/`.
2. GitHub Actions ejecuta `clasp push` contra el proyecto `CUDO_WEB_FORMS_QA`.
3. GitHub Actions actualiza el deployment web estable.
4. GitHub llama al endpoint protegido del deployment.
5. El endpoint acepta únicamente la acción `provisionAllQA` y valida `CUDO_QA_AUTOMATION_TOKEN`.
6. `provisionAllQA()` crea/reutiliza y valida Noticias, Equipos, Plantel, Partidos y Galería.
7. Cualquier error devuelve `ok:false` y hace fallar el workflow.

## Bootstrap único

Estos elementos se configuran una sola vez y después dejan de ser trabajo operativo:

- `CUDO_APPS_SCRIPT_ID` como GitHub Actions secret.
- `CUDO_APPS_SCRIPT_DEPLOYMENT_ID` como GitHub Actions secret.
- `CUDO_QA_AUTOMATION_TOKEN` como GitHub Actions secret y Script Property del Apps Script.
- `CLASP_AUTH_JSON` como GitHub Actions secret.
- Autorización OAuth inicial del usuario propietario del Apps Script.

El token puede configurarse una vez ejecutando `configureAutomationToken('<TOKEN>')` en Apps Script o estableciendo la Script Property `CUDO_QA_AUTOMATION_TOKEN`.

## Regla de no retorno

No volver a usar como procedimiento recurrente:

`GitHub → copiar Code.gs → pegar en Apps Script → seleccionar provisionAllQA → Ejecutar`

Ese patrón queda permitido solo como bootstrap/emergencia controlada.

## Seguridad

- El web app ejecuta como el usuario desplegador para conservar los permisos existentes de Forms/Sheets/Drive.
- El endpoint público no permite seleccionar funciones arbitrarias.
- Solo ejecuta `provisionAllQA`.
- Requiere un token de al menos 32 caracteres guardado en Script Properties y GitHub Secrets.
- Usa `LockService` para evitar dos provisionamientos simultáneos.
- Los secretos no se almacenan en el repositorio.

## Criterio de cierre

El hito queda CERTIFICADO cuando un workflow `CUDO QA Forms Auto` termine SUCCESS y la verificación posterior confirme los cinco módulos en `FORMULARIOS_QA` con sus Forms, Sheets, RAW y validaciones correctas.
