# CUDO — Publisher Noticias (LAB)

Publisher canónico del módulo Noticias para la rama `portal-shell-v6`.

## Flujo

`SIM_WEB_NOTICIAS` → gate editorial → proyección pública → comparación → GitHub → `preview-v6/data/noticias.json` → `PUBLISH_LOG`.

## Gate de publicación

Una fila solo entra al JSON público cuando cumple simultáneamente:

- `ESTADO = PUBLICADO`
- `PUBLICAR = SI`
- `PRIVACIDAD = PUBLICO`

Antes de escribir GitHub, el workflow bloquea la publicación si una fila publicable no tiene `ID_NOTICIA`, `FECHA`, `SLUG`, `TITULO` o `RESUMEN`, o si existen IDs/SLUGs duplicados.

El JSON público solo exporta: `id`, `fecha`, `slug`, `titulo`, `resumen`, `cuerpo`, `imagen_ref`.

## Seguridad LAB

- Spreadsheet: `SIM_WEB_NOTICIAS`
- Sheet fuente: `NOTICIAS`
- Log: `PUBLISH_LOG`
- Repo: `carlitosvaldesmorales/cudo-pago`
- Branch fija: `portal-shell-v6`
- Target: `preview-v6/data/noticias.json`
- Token GitHub: variable secreta `CUDO_GITHUB_TOKEN`
- No contiene credenciales embebidas.
- No escribe en `main`.

## Primer uso

1. Importar `CUDO_WEB_PUBLISH_NOTICIAS_LAB.n8n.json` en n8n.
2. Asignar la credencial Google Sheets institucional al nodo de lectura y al nodo de log.
3. Definir `CUDO_GITHUB_TOKEN` con permiso de Contents sobre el repositorio.
4. Ejecutar manualmente.
5. Confirmar el registro en `PUBLISH_LOG` y el resultado en `preview-v6/data/noticias.json`.

El workflow evita commits cuando la proyección pública no cambió; `generated_at` no se usa para decidir si hay diferencias.
