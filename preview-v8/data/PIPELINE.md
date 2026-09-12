# CUDO V8 · Pipeline de datos QA

Ambiente: QA integración Google.
Rama histórica de integración: `qa-v8-google-data`.

## Regla sistémica vigente

Este pipeline es una vía de **captura/control editorial de CUDO**. No constituye por sí mismo la autoridad del dominio deportivo común de Fútbol Chépica.

```text
Google Form QA -> RAW_FORM_* -> CONTROL -> PUBLICO_EXPORT -> preview-v8/data/*.json -> renderer V8
```

Los JSON son proyecciones/materializaciones para la web CUDO, no nuevas fuentes de verdad cuando el dato pertenece al bounded context `FUTBOL_CHÉPICA`.

## Autoridad por bounded context

### CUDO

Actualmente pertenecen al contexto editorial del club y pueden seguir usando `CONTROL -> PUBLICO_EXPORT` como autoridad de publicación:

- `noticias.json` → noticias CUDO;
- `equipos.json` → categorías/equipos publicados por CUDO;
- `plantel.json` → plantel publicado por CUDO;
- `galeria.json` → galería CUDO.

### Fútbol Chépica / competición ANFA

Fixture, resultados oficiales y futuras posiciones del campeonato NO pueden tener una autoridad paralela en Google Sheets.

- el fixture oficial vive en Sports Event Bus/D1;
- los resultados gobernados viven en Sports Event Bus/D1;
- la tabla del campeonato debe derivarse de resultados oficiales + reglas aprobadas;
- `championship-fixture.json` es sólo un fallback snapshot point-in-time;
- `partidos.json` (`CUDO_WEB_PARTIDOS`) y `tabla.json` (`CUDO_WEB_TABLA`) quedan clasificados como `LEGACY_UNRESOLVED_NON_AUTHORITY` para el campeonato hasta decidir su eventual objetivo propio de club o retiro.

El inventario ejecutable de autoridades está en `docs/architecture/system-authority-registry-v1.json`.

## Reglas

- `qa-v8-mock` es fixture de prueba y no autoridad productiva.
- Los formularios sólo capturan. Nunca publican directamente.
- `CONTROL` es la capa editorial/curada para contenido CUDO.
- `PUBLICO_EXPORT` contiene el contrato público del contenido CUDO que le corresponde.
- Nunca exponer RUT, teléfonos, correos privados, direcciones, observaciones internas, autorizaciones ni nombres de origen privados.
- QA y PROD usan el mismo schema para una misma proyección; el ambiente no cambia su significado.
- Una proyección nunca puede promoverse silenciosamente a segunda autoridad del mismo scope semántico.

## Campeonato · vertical de referencia

La página `preview-v8/partidos/` ya consume `GET /api/v1/public-championship` mediante `preview-v8/shared/championship.js`. Si el servicio no está disponible puede usar `championship-fixture.json` como snapshot seguro, pero ese fallback no recibe autoridad de escritura y no reemplaza D1.

La publicación de un marcador de competición sólo puede provenir del estado gobernado del Sports Event Bus; estados pendientes, en revisión o anulados no se convierten en marcadores oficiales por inferencia.
