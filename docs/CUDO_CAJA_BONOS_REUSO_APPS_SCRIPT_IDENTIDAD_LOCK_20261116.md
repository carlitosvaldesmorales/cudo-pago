# CUDO Bonos — identidad y bloqueo en el Apps Script EXISTENTE

El dinero tiene una autoridad: caja y núcleo de CUDO Pago. El token GitHub Actions puede leer Google Sheets, pero no pudo demostrar usuario efectivo por la autorización OpenID. No justifica inventar otro OAuth ni representa una cuenta equivocada.

## EVIDENCIA Y EJECUCIÓN

- Fuente preexistente: qa-v8-google/apps-script/CudoWorkStateWeb.gs, proyecto privado de Google Apps Script 1NI73jgr_PFvrsHy27ejE_kLbM1Y8Nyc6mRaWlcCaLlZrpEB3Ud8, deployment vía workflow original deploy-cudo-work-state-web-qa.yml. Conservar acceso MYSELF y ejecución USER_DEPLOYING.
- Archivo añadido al MISMO proyecto: qa-v8-google/apps-script/CudoBonosCajaReadiness.gs verifica Session.getEffectiveUser() contra sistemas@cudo.cl, obliga coincidencia de usuario activo si aparece, obtiene LockService.getScriptLock y revisa las tres cabeceras originales del libro, incluido TX_ID. Siempre deja financialWriterEnabled=false. No lee balances, contactos ni emite dinero.
- CudoWorkStateWeb.gs muestra estado técnico de caja en el panel privado original sin tocar el WORK_ITEM ni enviar solicitudes financieras.
- CI existente certify-cudo-operational-work-state.yml y cudo-root-acceptance.yml comprueba con Node VM cuenta efectiva distinta, usuario activo discordante, activo vacío, bloqueo ocupado, tab faltante y cambio de K1, además de liberación y cero escrituras.
- Previa a la publicación, el mismo workflow consulta en SOLO LECTURA el proyecto Apps Script original por API oficial Google, reutilizando OAuth de CUDO, sin exponer credenciales; verifica código original, manifiesto y pertenencia del enlace estable al proyecto en lugar de inferirlo.
- Se amplía la misma acción deploy-cudo-work-state-web-qa.yml para incluir el nuevo .gs en el MISMO proyecto y verificar el código publicado. No se crea app, servidor, perfil, cron ni otro libro.

## GAP DE NEGOCIO NO OCULTO

Probar ScriptLock y sesión efectiva no activa un escritor financiero. Falta recuperar dinero real certificado desde la D1 por origen autenticado; el escritor Node de CUDO Pago falla cerrado hasta disponer de authorizedInstitutionalPrincipal, withInstitutionalExclusiveLock, readBook y batchWriteAndReadback. No aceptar JSON público de supuesto pago como prueba. Aún falta cash count, extracto banco, payout MP y verificación de única escritura TX_ID + QR + sorteo y entrega de premio. Producción MONEY/PUBLIC permanecen OFF.
