# Telegram QA

Ejecutar desde la raíz del repositorio con Node 24:

```bash
node qa/telegram/telegram-harness.mjs
```

El harness no requiere credenciales. Usa SQLite en memoria, identidades sintéticas y un token Telegram ficticio. Cualquier intento de red fuera del transporte Telegram interceptado provoca fallo inmediato.

La fuente probada es el mismo `sports-bus/cors-entry.js` utilizado por el Worker productivo.
