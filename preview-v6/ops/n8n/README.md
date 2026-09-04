# CUDO — Publisher Noticias (LAB)

Este directorio contiene el flujo de laboratorio que publica la proyección pública de Noticias desde Google Sheets hacia GitHub Pages.

## Flujo

SIM_WEB_NOTICIAS (Google Sheets)
→ filtro editorial
→ JSON público
→ GitHub `portal-shell-v6`
→ `preview-v6/data/noticias.json`
→ módulo Noticias de V6

## Gate de publicación

Una fila solo entra al JSON público cuando cumple simultáneamente:

- `ESTADO = PUBLICADO`
- `PUBLICAR = SI`
- `PRIVACIDAD = PUBLICO`

Además, antes de publicar el flujo bloquea la ejecución si una fila publicable:

- no tiene `ID_NOTICIA`, `FECHA`, `SLUG`, `TITULO` o `RESUMEN`;
- repite `ID_NOTICIA`;
- repite `SLUG`.

El JSON público excluye deliberadamente `FUENTE`, `CLASIFICACION`, `RESPONSABLE`, `FECHA_REVISION` y `OBSERVACIONES`.

## Configuración requerida en n8n

1. Importar `CUDO_SIM_WEB_NOTICIAS_PUBLISHER.json`.
2. Asignar una credencial Google Sheets al nodo `Leer SIM_WEB_NOTICIAS`.
3. Definir en el entorno de n8n la variable secreta:
   - `CUDO_GITHUB_TOKEN`
4. El token debe poder leer/escribir Contents en `carlitosvaldesmorales/cudo-pago`.
5. Ejecutar primero con `Manual Trigger`.

## Alcance LAB

- Spreadsheet: `SIM_WEB_NOTICIAS`
- Spreadsheet ID: `14ZCRIuCBtZQ_obcXzxYY3FKDScSMZG1v7UZ0954nwJI`
- Sheet: `NOTICIAS`
- Repo: `carlitosvaldesmorales/cudo-pago`
- Branch: `portal-shell-v6`
- Target: `preview-v6/data/noticias.json`

No escribe en `main` ni en producción.

## Evolución posterior

Solo después de validar el viaje completo manual:
- agregar disparo programado o webhook;
- replicar el patrón para Galería, Equipos y otros módulos;
- cambiar el target a producción mediante un gate explícito.
