# DIRIGENTES-LIFECYCLE-01

Fecha: 2026-09-09
Branch: `feature/futbol-chepica-multiclub-01`
Estado: MATERIALIZADO EN BRANCH / PENDIENTE CI Y E2E

## Objetivo

Cerrar el ciclo administrativo mínimo de un `CLUB_ADMIN` sin eliminar identidades ni perder trazabilidad.

## Alcance exacto

```text
listar
  ↓
ver detalle
  ↓
┌─────────────┬───────────────┐
│             │               │
suspender   reactivar       revocar
```

No incluye todavía cambio de club, cambio de rol fino ni múltiples clubes por persona.

## Estados y semántica

### Activo

```text
role = CLUB_ADMIN
active = 1
trust_level = VERIFIED
club_id = <club>
```

Puede usar las funciones administrativas dentro del alcance de su club.

### Suspendido

```text
role = CLUB_ADMIN
active = 0
trust_level = VERIFIED
club_id = <club>
```

Conserva vínculo e historial, pero no puede usar funciones administrativas. Las sesiones abiertas de ingreso de resultados se eliminan.

### Reactivado

```text
role = CLUB_ADMIN
active = 1
trust_level = VERIFIED
club_id = <club>
```

Recupera el mismo club y rol.

### Revocado

```text
role = REPORTER
active = 1
trust_level = PROVISIONAL
club_id = NULL
```

No se borra la fila de `reporters`. El usuario conserva identidad e historial y puede usar el portal público. Puede volver a solicitar acceso en el futuro.

## Seguridad

- Sólo `SUPER_ADMIN + VERIFIED + active=1` puede listar y modificar dirigentes.
- El handler sólo administra filas cuyo rol actual sea `CLUB_ADMIN`; no puede operar sobre otro SUPER_ADMIN aunque se construya manualmente un callback.
- Suspender y revocar eliminan `telegram_series_sessions` del objetivo.
- Los flujos de resultados existentes vuelven a comprobar `active`, `trust_level`, `role` y `club_id` en backend; ocultar botones no es el control de seguridad.
- Operaciones repetidas son idempotentes a nivel funcional: suspender un suspendido o reactivar un activo no vuelve a escribir la transición; revocar una segunda vez no encuentra un CLUB_ADMIN objetivo.

## Auditoría

Cada transición efectiva escribe `permission_audit` con:

- actor = SUPER_ADMIN ejecutor
- acción = `SUSPEND_CLUB_ADMIN`, `REACTIVATE_CLUB_ADMIN` o `REVOKE_CLUB_ADMIN`
- resource_type = `reporter`
- resource_id = Telegram ID del objetivo
- club_id = club afectado
- fecha y razón

Además se escribe `events` con payload que conserva la identidad objetivo y estado anterior relevante.

## UX esperada

El SUPER_ADMIN recibe un menú extendido:

```text
🛡 FÚTBOL CHÉPICA · ADMIN GLOBAL

🔔 Solicitudes
👥 Dirigentes
📋 Resultados registrados
⚽ Mis partidos de club
🏠 Inicio
```

`👥 Dirigentes` lista CLUB_ADMIN activos y suspendidos. El detalle expone sólo las acciones válidas para el estado actual y exige confirmación antes de revocar.

## Prueba E2E requerida para cerrar G1

Usar una cuenta real CLUB_ADMIN ya aprobada (actualmente existe una de Unión Orilla):

1. SUPER_ADMIN abre `Dirigentes` y visualiza la cuenta.
2. Suspende la cuenta.
3. Desde la cuenta suspendida intentar entrar a `🔐 Dirigentes` y a un callback viejo de resultados: ambos deben quedar sin privilegio administrativo.
4. SUPER_ADMIN reactiva la cuenta.
5. La cuenta recupera el portal del club.
6. Revocar sólo si se acepta que luego sea necesario volver a solicitar/aprobar acceso. Si no se desea alterar al dirigente piloto, la revocación se valida con una segunda identidad de prueba controlada.

Hasta completar esta prueba, G1 no se marca E2E VALIDADO.

## GAP deliberadamente postergado

- Cambio de club conservando historial temporal.
- Delegación de más de un CLUB_ADMIN por club como política formal.
- Una persona asociada a más de un club.
- Segundo SUPER_ADMIN / recuperación de control (Gate G5).
