# DIRIGENTES-LIFECYCLE-01

Fecha: 2026-09-10
Branch activa: `feature/sports-event-bus-v1`
Estado: **MATERIALIZADO + QA TÉCNICO PASS / E2E HUMANO DIFERIDO**

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

## QA técnico ejecutable

PR #25 incorporó:

- `qa/telegram/dirigentes-lifecycle-harness.mjs`
- `.github/workflows/validate-dirigentes-lifecycle.yml`

El harness aplica las migraciones reales sobre SQLite/D1 adapter y prueba comportamiento, no sólo presencia de texto en código.

Resultado CI del 2026-09-10: **PASS**.

Queda demostrado automáticamente:

- SUPER_ADMIN puede listar e inspeccionar CLUB_ADMIN;
- suspensión conserva identidad, club, rol y trust, pero deja `active=0`;
- reactivación restaura `active=1` con el mismo vínculo;
- revocación exige confirmación y conserva la identidad, cambiando a REPORTER/PROVISIONAL y `club_id=NULL`;
- cada transición efectiva deja `permission_audit` y `events`;
- repetir una transición no duplica el cambio ni la auditoría;
- un callback construido manualmente no puede modificar otro SUPER_ADMIN;
- un actor no global no puede modificar dirigentes.

PR #25 fue fusionado a la rama activa con merge `979793787d5c2c15378aabe2386f9c5ea934f196`.

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

## E2E humano pendiente — diferido, no bloquea otros frentes

Sigue pendiente comprobar con una cuenta real CLUB_ADMIN en Telegram:

1. entrar al bot nuevo y recuperar automáticamente el rol existente;
2. suspender la cuenta y comprobar desde esa misma cuenta que pierde privilegios administrativos;
3. reactivar y comprobar que recupera el portal del club;
4. validar revocación sólo con una identidad de prueba que sea seguro degradar.

Carlos indicó el 2026-09-10 que esa segunda cuenta no está disponible en este momento. Por tanto este E2E queda **DIFERIDO** y no debe usarse como bloqueo artificial para continuar otros módulos. Tampoco se marca como PASS hasta realizarlo.

## GAP deliberadamente postergado

- Cambio de club conservando historial temporal.
- Delegación de más de un CLUB_ADMIN por club como política formal.
- Una persona asociada a más de un club.
- Segundo SUPER_ADMIN / recuperación de control (Gate G5).
