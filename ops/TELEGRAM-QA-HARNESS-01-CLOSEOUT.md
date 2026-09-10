# TELEGRAM-QA-HARNESS-01 — CLOSEOUT TÉCNICO

Estado: LISTO PARA INTEGRAR

## Evidencia

- Branch: `feature/telegram-qa-harness-01`
- Harness: `qa/telegram/telegram-harness.mjs`
- Adaptador D1/SQLite: `qa/telegram/d1-sqlite-adapter.mjs`
- CI recurrente: `.github/workflows/validate-telegram-qa-harness.yml`
- Último run branch: `34421183063` — SUCCESS.

## Cobertura cerrada automáticamente

`/start → enrollment → aprobación → CLUB_ADMIN → alcance por club → resultado VERIFIED → sesión abierta → suspensión → bloqueo de re-solicitud/callback viejo → reactivación → revocación → re-solicitud → auditoría`.

No se usaron datos ni Telegram reales y no se modificó D1 remoto.

## Bloqueante humano alcanzado

La siguiente evidencia no puede generarse en CI: entrega/render real en un cliente Telegram autenticado y cambio efectivo de permisos entre dos identidades reales/controladas.

Prueba mínima requerida:

1. SUPER_ADMIN abre `🔐 Dirigentes → 👥 Dirigentes`.
2. Suspende la cuenta CLUB_ADMIN piloto.
3. Esa cuenta intenta `🔐 Dirigentes` y un callback antiguo de resultados; debe quedar bloqueada.
4. SUPER_ADMIN reactiva la cuenta.
5. La cuenta vuelve a entrar al portal de su club.

Éste es el primer bloqueante real de la fase.
