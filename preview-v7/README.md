# C.U.D.O. Portal V7 — paquete autocontenido

Rama: `portal-package-v7`

Objetivo: materializar en GitHub Pages todo lo que hoy puede existir sin depender de n8n, Apps Script, WhatsApp, Telegram ni otro runtime externo.

## Módulos

- `index.html`: portada y navegación principal.
- `club/index.html`: información institucional pública.
- `noticias/index.html`: módulo público de noticias.
- `equipos/index.html`: módulo público de equipos/categorías.
- `galeria/index.html`: módulo público de fotografías.
- `shared/site.css`: diseño común.
- `shared/site.js`: navegación móvil y render público.
- `data/noticias.json`: contrato de Noticias.
- `data/equipos.json`: contrato de Equipos.
- `data/galeria.json`: contrato de Galería.

## Regla de datos

Los JSON parten vacíos deliberadamente. No se inventan noticias, planteles, nombres de jugadores ni fotografías. Cada módulo falla cerrado: si no existe contenido público validado, muestra un estado vacío controlado.

## Dependencias actuales

Solo usa recursos ya existentes en el repositorio (`assets/logo-cudo.png`, `assets/estadio-v2.webp`) y el enlace institucional vigente de Mercado Pago ya utilizado en la versión aprobada.

## Fuera de alcance de V7

No incluye automatizadores, bots, webhooks, Apps Script, n8n, Activepieces, Telegram ni WhatsApp. Esas capas solo deben materializarse después de demostrar su runtime y acceso.

## Seguridad

El portal no debe exponer PII, registros internos, RUT personales, teléfonos, correos privados, datos de menores ni bases de socios. Solo proyecciones públicas validadas.
