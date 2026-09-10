# FUTBOL-CHEPICA-DOMAIN-01

Fecha: 2026-09-10
Estado: **DOMINIO REGISTRADO / DNS PENDIENTE**

## Evidencia

EVIDENCIA HUMANA: confirmación de NIC Chile compartida el 2026-09-10 demuestra que `futbolchepica.cl` fue inscrito. No se persisten en este documento datos personales del registro.

La inscripción del dominio demuestra existencia/registro, pero NO demuestra todavía delegación DNS a Cloudflare, zona activa, TLS ni routing hacia el Worker.

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

## Próximo gate externo

1. Incorporar `futbolchepica.cl` como zona Cloudflare o confirmar que ya existe.
2. Obtener los nameservers asignados por Cloudflare.
3. Cambiar/delegar los nameservers del dominio en NIC Chile.
4. Esperar que Cloudflare reporte la zona como `active`.
5. Sólo después, adjuntar el Custom Domain al Worker y promover `web_host_bindings` a `VERIFIED + active=1`.

No se debe saltar del registro del dominio directamente a `VERIFIED`.
