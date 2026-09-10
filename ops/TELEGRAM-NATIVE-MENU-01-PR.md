# TELEGRAM-NATIVE-MENU-01 — PR HANDOFF

Objetivo del PR: llevar a producción el botón nativo `Menu` de Telegram con comandos mínimos y perfilados por rol, manteniendo RBAC como fuente de autorización.

Criterios de aceptación:

1. `setChatMenuButton` configura `commands` por defecto.
2. `setMyCommands` configura comandos públicos por defecto.
3. Cada chat privado sincroniza comandos `PUBLIC`, `CLUB_ADMIN` o `SUPER_ADMIN` sólo cuando cambia perfil/versión.
4. Suspensión/revocación degrada el menú a PUBLIC en la siguiente interacción.
5. El usuario puede entrar por `/inicio` y comandos directos sin memorizar rutas de `/start`.
6. G1 y los QA deportivos existentes siguen pasando.
7. El deploy debe fallar si Telegram no confirma menú o comandos por defecto.
8. E2E final pendiente únicamente de render real en Telegram iOS.
