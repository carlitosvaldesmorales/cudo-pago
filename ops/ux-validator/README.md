# CUDO / Fútbol Chépica — Validador UX open-source

## Objetivo

Separar **diseño**, **validación UX** e **implementación**. Una propuesta visual no puede considerarse validada porque el mismo agente que la diseñó diga que es correcta.

Este gate usa componentes abiertos y ejecutables sin servicios SaaS de UX:

- **Istara** (MIT), fijado a un commit conocido, como fuente de los roles independientes de evaluación:
  - `istara-ux-eval` / Sage: carga cognitiva, recorrido y fricción.
  - `istara-ui-audit` / Pixel: heurísticas de interfaz, claridad y accesibilidad.
- **Ollama** (MIT) como runtime local.
- **Qwen2.5-1.5B-Instruct** (Apache-2.0) para Sage.
- **SmolLM2-1.7B-Instruct** (Apache-2.0) para Pixel.

No usa Uxia, API pagada ni una clave de un proveedor LLM. Los dos evaluadores se ejecutan en procesos separados/modelos distintos sobre el mismo artefacto de diseño.

## Evidencia evaluada

El input principal es el código real de `sports-bus/worker/public-results-ux-v2.js`, no una maqueta inventada. Se incorpora además `evidence-v2.md`, que contiene únicamente observaciones humanas no sensibles derivadas del E2E iOS. La captura real no se publica en el repositorio.

## Regla de decisión

El runner genera tres capas de evidencia:

1. **Métrica estructural determinista**: detecta, entre otras cosas, si la navegación agrega mensajes (`sendMessage`) en vez de reutilizar un panel (`editMessageText`).
2. **Sage / modelo A**: cognitive walkthrough y carga mental.
3. **Pixel / modelo B**: heurísticas, jerarquía, consistencia y accesibilidad.

Resultado de consenso:

- `PASS`: ambos validadores PASS y no existen red flags estructurales.
- `REJECT`: ambos validadores REJECT, o existe red flag estructural y al menos uno REJECT.
- `CONDITIONAL`: desacuerdo o evidencia insuficiente.

La salida no modifica producción. Se guarda como artifact y GitHub Step Summary. Sólo después del resultado se diseña una siguiente versión.

## Principio de gobernanza

`OBSERVAR → VALIDAR INDEPENDIENTE → DISEÑAR → VALIDAR → IMPLEMENTAR → E2E HUMANO`

La validación automática no sustituye el E2E humano final en Telegram iOS; sirve para evitar que una hipótesis del implementador se convierta directamente en código.