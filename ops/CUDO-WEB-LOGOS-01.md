# CUDO-WEB-LOGOS-01

Estado: EN_EJECUCION — FUNCIONAL ESTABLE / FUENTE VISUAL PENDIENTE

- [x] Inventariar 11 clubes
- [x] Preparar 11 PNG individuales 512x512 localmente
- [x] Detectar corrupción del WebP HD subido directamente
- [x] Retirar el binario corrupto del runtime
- [x] Restaurar transporte WebP por chunks validado
- [x] Playwright open source en producción
- [x] QA Clubes móvil/escritorio
- [x] QA Partidos móvil/escritorio
- [x] Transporte de escudos validado
- [x] 11/11 clubes renderizados
- [x] Máscara de borde para reducir contaminación entre celdas
- [x] Run producción 34279299473: SUCCESS
- [x] Revisión humana de captura 2260 realizada
- [ ] CONFORME visual definitivo

Hallazgo de revisión visual: la máscara mejora fuertemente la presentación, pero el sprite fuente todavía contiene fragmentos de celdas vecinas en algunos clubes. No se declara CONFORME por ese motivo.

Solución definitiva ya identificada: abandonar el sprite como fuente y publicar los 11 PNG individuales preparados, preservando identidad y transparencia. El bloqueo actual es de transporte binario reproducible desde el conector GitHub; no de diseño ni de datos.

Regla: workflow verde != conformidad visual. CONFORME exige fuente individual limpia + capturas inspeccionadas.
