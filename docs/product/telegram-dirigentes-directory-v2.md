# Telegram · Directorio de Dirigentes v2

Estado: **MATERIALIZADO**
Superficie: Telegram · `🔐 Dirigentes → 👥 Dirigentes`
Autoridad de identidad: `reporters`
Autoridad de afiliación Asociación: `actor_scope_grants`

## Intención

Mostrar y administrar en un mismo directorio a:

- dirigentes de los clubes;
- dirigentes de la Asociación de Fútbol Chépica.

La Asociación **no se modela como un club** y pertenecer a la Asociación **no concede permisos administrativos por sí solo**.

## Invariante

`AFFILIATION_NEQ_AUTHORITY`

La pertenencia institucional y la autoridad técnica son dimensiones distintas.

Un mismo actor puede, por ejemplo:

- ser `CLUB_ADMIN` de un club;
- figurar además como dirigente de la Asociación;
- conservar exactamente las capacidades que ya tenía antes de esa afiliación.

## Proyección Telegram

```text
👥 DIRIGENTES

🏟 Clubes: 5/5 activos
🏛 Asociación: 2/2 activos

[🏟 Clubes (5/5)]
[🏛 Asociación (2/2)]
[⬅️ Admin global]
```

### Clubes

Mantiene el mecanismo existente:

- fuente: `reporters.role='CLUB_ADMIN'`;
- agrupación: `teams`;
- lifecycle: inspeccionar, suspender/reactivar y revocar acceso.

### Asociación

Reutiliza `actor_scope_grants`:

- `role='ASSOCIATION_DIRIGENTE'`;
- `scope_type='PLATFORM'`;
- `scope_id='FUTBOL-CHEPICA'`;
- `capabilities_json='[]'`;
- `source_label='Asociación de Fútbol Chépica'`.

No se crea un `team` artificial para la Asociación.

## Alta

Desde:

`Dirigentes → Asociación → ➕ Agregar dirigente de Asociación`

El SUPER_ADMIN selecciona una identidad que ya haya interactuado con el bot.

La vinculación:

1. crea/reactiva la afiliación en `actor_scope_grants`;
2. conserva `reporters.role`;
3. conserva `reporters.club_id`;
4. conserva `reporters.trust_level`;
5. escribe `permission_audit`;
6. escribe evento;
7. declara `permission_change=false`.

Si una persona también es dirigente de club, ambas afiliaciones coexisten sobre la misma identidad.

## Baja / reactivación

Quitar a una persona del listado activo sólo cambia:

`actor_scope_grants.active = 0`

No elimina la identidad, no revoca su rol de club y no cambia otros grants.

Reactivar vuelve a `active = 1`.

## Eventos y auditoría

- `LINK_ASSOCIATION_DIRIGENTE`
- `SUSPEND_ASSOCIATION_DIRIGENTE`
- `REACTIVATE_ASSOCIATION_DIRIGENTE`
- `telegram.association_dirigente.linked`
- `telegram.association_dirigente.suspended`
- `telegram.association_dirigente.reactivated`

## Anti-desvío

- asociación no es un club;
- no crear `ASOCIACION-CHEPICA` dentro de `teams`;
- afiliación no implica `CLUB_ADMIN`;
- afiliación no implica `PLATFORM_OPERATOR`;
- afiliación no implica `SUPER_ADMIN`;
- no cambiar permisos existentes al vincular Asociación;
- no duplicar la persona en `reporters`;
- el SUPER_ADMIN sigue siendo el único actor que administra este directorio.

## Evidencia ejecutable

- `sports-bus/worker/dirigentes-lifecycle-entry.js`
- `sports-bus/worker/telegram-dirigentes-home-entry.js`
- `qa/telegram/dirigentes-lifecycle-harness.mjs`
- `.github/workflows/validate-dirigentes-lifecycle.yml`
