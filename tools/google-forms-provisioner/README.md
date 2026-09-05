# CUDO · Google Forms Provisioner

## Decisión de arquitectura

Google Forms REST API permite crear/modificar Forms y leer respuestas, pero `linkedSheetId` es **output only**. Por lo tanto la API REST no ofrece una operación para fijar directamente una Google Sheet como destino de respuestas.

Google Apps Script Forms Service sí expone `Form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheetId)`. Por eso el provisionamiento oficial CUDO usa `FormApp` para crear el Form y enlazarlo a Sheets.

GitHub es la fuente de verdad del código. El proyecto existente `CUDO_WEB_FORMS_QA` es el runtime y no se borra ni se recrea.

## Runtime confirmado

- Google Cloud estándar: `arke-cudo-core` / project number `257090036200`
- OAuth desktop client: `cudo-os-desktop-sistemas`
- OAuth Client ID: `257090036200-mr8qoeglsklm8peu9s8mp8r9dcdphab4.apps.googleusercontent.com`
- Script ID: `1NI73jgr_PFvrsHy27ejE_kLbTWwLbM1Y8Nyc6mRaWlcCaLlZrpEB3Ud8`
- API executable deployment ID: `AKfycbzfvr6SZM7wZGMv0qCFrhWE-z-YpNbyxxyBy4DxJOMWyIvUNU8zkMLsJxau4h0SVIKWuw`

## Flujo recurrente

`GitHub → OAuth refresh → Apps Script API → projects.updateContent → version → deployment → scripts.run(provisionAllQA) → validación QA`

`provisionAllQA()` crea/reutiliza y valida Noticias, Equipos, Plantel, Partidos y Galería. PROD no se ejecuta desde este workflow.

## Bootstrap OAuth único

El OAuth Client Desktop ya está identificado. Para clientes instalados se usa PKCE, por lo que este bootstrap no necesita recuperar ni almacenar `client_secret`.

Scopes solicitados:

- `https://www.googleapis.com/auth/forms`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/script.projects`
- `https://www.googleapis.com/auth/script.deployments`

Desde esta carpeta:

```bash
npm run bootstrap:oauth
```

El bootstrap:

1. comprueba `gh auth status`;
2. genera PKCE + `state` localmente;
3. abre el consentimiento Google para `sistemas@cudo.cl`;
4. captura el callback OAuth en `127.0.0.1`;
5. obtiene un refresh token QA;
6. carga únicamente `CUDO_GOOGLE_REFRESH_TOKEN` como GitHub Actions Secret;
7. no imprime el token y no requiere `client_secret`.

## Ambientes

- QA Sheet Partidos: `1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI`
- QA carpeta Forms: `1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY`
- PROD Sheet Partidos: `1wD-UcUOU12UbCNtGyEjwXe27F3PrmzMLd6h8H3zmt68`
- PROD carpeta Forms: `1IQkr83hoPnoto21u0JyPcBD6mPBWZyPu`

## Regla de publicación

El Form solo captura. Nunca publica. La publicación requiere los gates de `CONTROL` y solo `PUBLICO_EXPORT` puede proyectarse al JSON público.

## PROD

`provisionPartidosPROD()` permanece bloqueado y exige el argumento literal `PROVISIONAR_PROD`. El workflow QA no lo invoca.
