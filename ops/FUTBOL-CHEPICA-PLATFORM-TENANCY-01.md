# FUTBOL-CHEPICA-PLATFORM-TENANCY-01

Fecha: 2026-09-10
Estado: **MATERIALIZADO + CI PASS + DESPLEGADO + RUNTIME PASS / HOST RAÍZ PENDIENTE**

## Decisión

`Fútbol Chépica` es la raíz lógica de la plataforma deportiva. Los clubes son tenants de esa plataforma. CUDO deja de modelarse como raíz del campeonato y queda como tenant de club.

Jerarquía materializada:

`FUTBOL-CHEPICA -> ANFA-CHEPICA-2026 -> TENANT/CLUB`

## Modelo

### Plataforma

- `platform_id`: `FUTBOL-CHEPICA`
- nombre: `Fútbol Chépica`
- slug: `futbol-chepica`

### Competición

`ANFA-CHEPICA-2026` está asociada explícitamente a `FUTBOL-CHEPICA` mediante `competitions.platform_id`.

### Tenants

Los 11 clubes actualmente presentes en el fixture se materializan una sola vez como tenants.

CUDO es el caso de identidad de marca distinta de la identidad deportiva:

- `tenant_id = CUDO`
- `club_id = UNION-ORILLA`
- `display_name = C.U.D.O.`
- `sporting_name = Unión Orilla`
- `route_path = /clubes/cudo`

No se crea un segundo tenant `UNION-ORILLA`; eso evita duplicar la misma entidad deportiva.

## Dominios

`cudo.cl` y `www.cudo.cl` están registrados como **DECLARED / inactive**. Esto registra la intención arquitectónica sin afirmar que DNS, TLS o routing estén verificados.

Un hostname sólo puede resolver contexto real cuando su binding es `VERIFIED + active=1`.

El dominio raíz de Fútbol Chépica NO se inventó ni se activó.

## Contratos públicos

- `GET /api/v1/platform` -> raíz, competiciones y catálogo de clubes/tenants.
- `GET /api/v1/clubs` -> tenants activos de la plataforma.
- `GET /api/v1/tenant/{tenant_id|slug}` -> perfil de tenant.
- `GET /api/v1/tenant/{tenant_id|slug}/matches` -> proyección de partidos sólo del club, reutilizando el read model gobernado por serie.
- `GET /api/v1/site-context` -> resuelve PLATFORM/TENANT por hostname únicamente si existe binding verificado; el hostname de servicio del Worker resuelve a PLATFORM como `SERVICE_DEFAULT`.

## Regla de datos

No se duplican resultados por tenant. Los partidos continúan viviendo una sola vez en el núcleo deportivo y cada tenant obtiene una proyección filtrada por `club_id`.

Un marcador sólo aparece en la proyección del tenant si el read model público de campeonato lo considera publicable; estados no oficiales no filtran marcador.

## Regla de seguridad

- tenant != club deportivo: la relación es explícita por `tenants.club_id`;
- un `club_id` sólo puede pertenecer a un tenant dentro del esquema actual;
- dominios declarados no otorgan routing ni CORS dinámico;
- sólo bindings `VERIFIED + active` pueden habilitar resolución de host y origen web dinámico;
- ningún endpoint público de tenancy expone identidad Telegram ni auditoría interna.

## Evidencia CI

PR #39 `Arquitectura: materializar Fútbol Chépica como plataforma multi-club` pasó `Validate Fútbol Chépica Platform Tenancy` y el resto de validaciones de regresión antes del merge.

El harness determinista validó:

- Fútbol Chépica como plataforma raíz y propietaria de `ANFA-CHEPICA-2026`;
- 11 clubes del campeonato como tenants únicos;
- `CUDO -> UNION-ORILLA` sin segunda identidad tenant deportiva;
- proyecciones de partidos aisladas por club;
- dominio declarado no activo antes de verificación externa;
- resolución PLATFORM/TENANT por binding verificado sin forks de código;
- hosts/orígenes no vinculados no son confiados.

## Evidencia deploy

PR #39 se integró a `feature/sports-event-bus-v1` con merge SHA `a414b22436bc81afce0c78d240b8b26abd296611`.

`Deploy Sports Event Bus` run `34531110941` (#72) terminó **SUCCESS**. El job confirma como exitosos:

- provisión de D1/binding;
- aplicación de migraciones, incluida `0014_platform_tenancy.sql` por orden de migración;
- validación de esquema existente;
- despliegue del Worker;
- validaciones públicas de runtime existentes.

## Evidencia runtime independiente

`qa/web/platform-tenancy-runtime-harness.mjs` ejecutado por `Validate Fútbol Chépica Platform Runtime` run `34531252202` terminó **SUCCESS** contra el Worker desplegado.

El runner externo comprobó:

- `FUTBOL-CHEPICA` es la plataforma raíz desplegada;
- existen 11 tenants visibles;
- CUDO resuelve a `club_id=UNION-ORILLA`;
- CUDO y Santa Elena reciben proyecciones distintas y acotadas a su club;
- las series no oficiales no filtran marcador por el endpoint de tenant;
- `cudo.cl` permanece `DECLARED`, inactivo/no verificado;
- el hostname de servicio del Worker resuelve a contexto PLATFORM.

## GAP externo actual

La plataforma ya puede resolver un futuro hostname raíz sin cambios de código, pero no existe evidencia autorizada para afirmar qué hostname se usará para Fútbol Chépica ni que su DNS esté bajo control.

No se activará un binding de plataforma hasta disponer de:

1. hostname/dominio exacto elegido para la raíz Fútbol Chépica;
2. confirmación de que se puede modificar su DNS.

Ese es el primer punto que requiere intervención humana. El resto de la capa multi-tenant hasta este gate está automatizado y demostrado en runtime.
