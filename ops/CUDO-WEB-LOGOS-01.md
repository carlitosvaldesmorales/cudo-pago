# CUDO-WEB-LOGOS-01

Estado: EN_EJECUCION

Objetivo: corregir la presentación visual de los 11 escudos y dejar QA visual reproducible.

- [x] Inventariar 11 clubes
- [x] Preparar 11 PNG individuales 512x512 localmente
- [x] Revisar visualmente los 11 activos locales
- [x] Detectar que la carga binaria directa a GitHub corrompió `crests-hd.webp`
- [x] Retirar `crests-hd.webp` del runtime y restaurar transporte WebP por chunks validado
- [x] Incorporar Playwright open source en producción
- [x] Capturar Clubes móvil/escritorio y Partidos móvil/escritorio
- [x] Detectar contaminación visual en bordes del sprite mediante revisión de capturas
- [x] Aplicar máscara de borde blanca en Clubes y Campeonato para eliminar líneas/fragmentos vecinos
- [ ] Confirmar nueva captura producción versión 20260908-2250
- [ ] Publicar los 11 activos individuales como solución definitiva cuando el transporte binario sea reproducible
- [ ] Cerrar CONFORME

Regla de cierre: un workflow verde no basta. CONFORME exige inspección visual de las capturas de producción.

Último run de producción solicitado: 34278962850.
