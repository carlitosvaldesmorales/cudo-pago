# CUDO · Google Forms Provisioner

## Decisión de arquitectura

Google Forms REST API permite crear/modificar Forms y leer respuestas, pero `linkedSheetId` es **output only**. Por lo tanto la API REST no ofrece una operación para fijar directamente una Google Sheet como destino de respuestas.

Google Apps Script Forms Service sí expone `Form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheetId)`. Por eso el provisionamiento oficial CUDO usa `FormApp` para crear el Form y enlazarlo a Sheets.

## Ambientes

- QA Sheet Partidos: `1AiIAh-gjtiWRTGoMAnhF-iN83XB4cWSgbeEUX_C7VbI`
- QA carpeta Forms: `1TtGqzfFOqQTIioySe8BmX64c3wGGIRhY`
- PROD Sheet Partidos: `1wD-UcUOU12UbCNtGyEjwXe27F3PrmzMLd6h8H3zmt68`
- PROD carpeta Forms: `1IQkr83hoPnoto21u0JyPcBD6mPBWZyPu`

## Flujo

`Google Form → hoja nativa de respuestas Google → RAW_FORM_PARTIDOS → CONTROL → PUBLICO_EXPORT → JSON GitHub → V8`

`FORM_SPEC` es el contrato de preguntas. El script crea el formulario desde esa pestaña, por lo que no duplicamos manualmente el schema.

## Primera ejecución

1. Crear un proyecto standalone de Google Apps Script con la cuenta institucional `sistemas@cudo.cl`.
2. Copiar `Code.gs` y `appsscript.json` de esta carpeta al proyecto.
3. Ejecutar `provisionPartidosQA()` una sola vez.
4. Google solicitará autorización OAuth para Forms, Sheets y Drive. Autorizar con `sistemas@cudo.cl`.
5. El script crea y publica `CUDO QA · Partidos y Resultados`, lo mueve a la carpeta QA de captura, lo enlaza a la Sheet QA y escribe en `FORM_SPEC!H:I` el `FORM_ID`, URL de edición, URL de respuesta, spreadsheet vinculado y pestaña de respuestas.
6. Probar una respuesta real del Form. Debe aparecer en la pestaña nativa de respuestas y, mediante `RAW_FORM_PARTIDOS`, alimentar `CONTROL`.

## PROD

No ejecutar antes de aprobar el flujo QA. `provisionPartidosPROD()` está bloqueado y exige el argumento literal `PROVISIONAR_PROD`.

## Regla de publicación

El Form solo captura. Nunca publica. La publicación requiere los gates de `CONTROL` y solo `PUBLICO_EXPORT` puede proyectarse al JSON público.
