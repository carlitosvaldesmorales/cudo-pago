# FUTBOL-CHEPICA-DOMAIN-01

Fecha: 2026-09-10
Estado: **DOMINIO REGISTRADO / PLATAFORMA DESPLEGADA / CLOUDFLARE ZONE BLOQUEADA POR PERMISO**

## Evidencia

EVIDENCIA HUMANA: confirmación de NIC Chile compartida el 2026-09-10 demuestra que `futbolchepica.cl` fue inscrito. No se persisten en este documento datos personales del registro.

La inscripción del dominio demuestra existencia/registro, pero NO demuestra todavía delegación DNS a Cloudflare, zona activa, TLS ni routing hacia el Worker.

EVIDENCIA TÉCNICA POST-DEPLOY: la migración y el contrato de plataforma fueron desplegados correctamente. El runtime externo confirmó que `futbolchepica.cl` y `www.futbolchepica.cl` están persistidos como bindings `PLATFORM`, `DECLARED`, inactivos/no verificados.

EVIDENCIA CLOUDFLARE: el workflow `Bootstrap Fútbol Chépica Domain` pudo autenticarse y consultar zonas con las credenciales existentes, pero Cloudflare rechazó la creación de la zona porque el token no posee `com.cloudflare.api.account.zone.create`.

## Decisión arquitectónica

`futbolchepica.cl` y `www.futbolchepica.cl` quedan declarados como hostnames de alcance `PLATFORM` para `FUTBOL-CHEPICA`.

Mientras no exista verificación DNS real:

- `verification_status = DECLARED`
- `active = 0`
- no habilitan resolución por hostname;
- no habilitan CORS dinámico;
- no se afirma TLS ni publicación del sitio.

## Preparación materializada

La plataforma expone sus bindings declarados en `/api/v1/platform`, lo que permite certificar desde `workers.dev` que la intención del dominio está persistida sin fingir activación.

El contrato ya soporta el estado futuro: cuando el hostname sea realmente verificado y se active el binding, `/api/v1/site-context` resolverá `PLATFORM` y el origen web quedará permitido sin fork de código.

El workflow de bootstrap quedó materializado de forma idempotente: si la zona ya existe, la descubre y devuelve sus nameservers; si no existe, intenta crearla. Por lo tanto no es necesario modificar código para continuar después del gate humano.

## Primer bloqueo humano real

Cloudflare no permite que el token automatizado cree una zona nueva. El siguiente acto requiere una de estas dos acciones humanas equivalentes:

1. **Preferida:** agregar manualmente `futbolchepica.cl` al mismo account de Cloudflare mediante el Dashboard. Después, el workflow existente podrá descubrir la zona y obtener los nameservers con el token actual.
2. Alternativa: ampliar/reemplazar el token usado por GitHub Actions para que tenga permiso de creación de zonas en la cuenta.

No se debe delegar NIC Chile a nameservers inventados ni promover el binding a `VERIFIED` antes de que Cloudflare entregue los nameservers reales.

## Continuación automática después del gate

1. Reejecutar `Bootstrap Fútbol Chépica Domain` y capturar los nameservers reales.
2. Entregar esos nameservers para delegación en NIC Chile.
3. Verificar que Cloudflare reporte la zona como `active`.
4. Adjuntar el Custom Domain al Worker.
5. Probar HTTPS y `/api/v1/site-context` sobre `futbolchepica.cl`.
6. Sólo con evidencia runtime, promover `web_host_bindings` a `VERIFIED + active=1`.
