# HITO CUDO-QA-AUTO-01

Estado: CERTIFICADO

Fecha de certificación: 2026-09-05

## Decisión de arquitectura

GitHub es la fuente de verdad del provisionador QA. Google Apps Script es el runtime. La operación recurrente no requiere copiar/pegar código ni ejecutar manualmente `provisionAllQA()`.

El proyecto `CUDO_WEB_FORMS_QA` se conserva: no se borra ni se recrea.

## Identidad Google confirmada

- Google Cloud project: `arke-cudo-core`
- Project number: `257090036200`
- OAuth desktop client dedicado QA: `cudo-qa-github-actions`
- Script ID: `1NI73jgr_PFvrsHy27ejE_kLbTWwLbM1Y8Nyc6mRaWlcCaLlZrpEB3Ud8`
- API executable deployment ID: `AKfycbzfvr6SZM7wZGMv0qCFrhWE-z-YpNbyxxyBy4DxJOMWyIvUNU8zkMLsJxau4h0SVIKWuw`

## Flujo recurrente certificado

1. Cambio aprobado en `tools/google-forms-provisioner/`.
2. GitHub Actions obtiene un access token con el OAuth Client QA dedicado y el refresh token almacenado en GitHub Secrets.
3. `projects.updateContent()` actualiza HEAD del Apps Script existente.
4. `projects.versions.create()` crea una versión inmutable.
5. `projects.deployments.update()` mueve el API executable estable a esa versión.
6. `scripts.run()` ejecuta `provisionAllQA`.
7. El runner valida Noticias, Equipos, Plantel, Partidos y Galería.
8. Cualquier error hace fallar el workflow.

## Bootstrap OAuth completado

El bootstrap único quedó completado con el cliente Desktop dedicado `cudo-qa-github-actions`.

GitHub Secrets utilizados:

- `CUDO_GOOGLE_OAUTH_CLIENT_ID`
- `CUDO_GOOGLE_OAUTH_CLIENT_SECRET`
- `CUDO_GOOGLE_REFRESH_TOKEN`

El JSON OAuth local se usa únicamente durante el bootstrap inicial. No debe copiarse al repositorio ni compartirse por chat.

Scopes autorizados:

- `https://www.googleapis.com/auth/forms`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/script.projects`
- `https://www.googleapis.com/auth/script.deployments`

## Evidencia de certificación

GitHub Actions workflow: `CUDO QA Forms Auto`

- Run ID: `33982208576`
- Resultado: `SUCCESS`
- Job: `deploy-and-provision`
- Resultado job: `SUCCESS`
- Apps Script version creada: `2`

`scripts.run(provisionAllQA)` confirmó sin errores:

- QA_NOTICIAS: OK / ACEPTANDO_RESPUESTAS
- QA_EQUIPOS: OK / ACEPTANDO_RESPUESTAS
- QA_PLANTEL: OK / ACEPTANDO_RESPUESTAS
- QA_PARTIDOS: OK / ACEPTANDO_RESPUESTAS
- QA_GALERIA: OK / ACEPTANDO_RESPUESTAS

El índice maestro `CUDO_WEB_INDICE_DATOS_2026` / `FORMULARIOS_QA` quedó verificado con los cinco módulos en `VALIDACION=OK` y `ESTADO=ACEPTANDO_RESPUESTAS`.

## Componentes retirados del flujo activo

- `clasp`
- `CLASP_AUTH_JSON`
- Web App `ANYONE_ANONYMOUS`
- `CUDO_QA_AUTOMATION_TOKEN`
- `Automation.gs`
- `CUDO_GOOGLE_OAUTH_CLIENT_JSON`
- `CUDO_GOOGLE_OAUTH_TOKENS_JSON`
- OAuth histórico `cudo-os-desktop-sistemas` como dependencia de QA

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
- Las credenciales OAuth recurrentes están almacenadas únicamente como GitHub Secrets.
- El JSON OAuth descargado no forma parte del repositorio.

## Cierre

CUDO-QA-AUTO-01 queda CERTIFICADO. La responsabilidad recurrente pasa al pipeline automatizado. La intervención humana queda limitada a autorizaciones excepcionales, rotación/revocación de credenciales o fallas reales de plataforma.
