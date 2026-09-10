# FUTBOL-CHEPICA-PLATFORM-TENANCY-01

Fecha: 2026-09-10
Estado: **MATERIALIZADO / CI Y RUNTIME PENDIENTES**

## Decisión

`Fútbol Chépica` pasa a ser la raíz lógica de la plataforma deportiva. Los clubes son tenants de esa plataforma. CUDO deja de modelarse como raíz del campeonato y queda como tenant de club.

Jerarquía materializada:

`FUTBOL-CHEPICA -> ANFA-CHEPICA-2026 -> TENANT/CLUB`

## Modelo

### Plataforma

- `platform_id`: `FUTBOL-CHEPICA`
- nombre: `Fútbol Chépica`
- slug: `futbol-chepica`

### Competición

`ANFA-CHEPICA-2026` queda asociada explícitamente a `FUTBOL-CHEPICA` mediante `competitions.platform_id`.

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

`cudo.cl` y `www.cudo.cl` quedan registrados como **DECLARED / inactive**. Esto registra la intención arquitectónica sin afirmar que DNS, TLS o routing estén verificados.

Un hostname sólo puede resolver contexto real cuando su binding es `VERIFIED + active=1`.

El dominio raíz de Fútbol Chépica NO se inventa ni se activa en esta fase.

## Contratos públicos

- `GET /api/v1/platform` -> raíz, competiciones y catálogo de clubes/tenants.
- `GET /api/v1/clubs` -> tenants activos de la plataforma.
- `GET /api/v1/tenant/{tenant_id|slug}` -> perfil de tenant.
- `GET /api/v1/tenant/{tenant_id|slug}/matches` -> proyección de partidos sólo del club, reutilizando el read model gobernado por serie.
- `GET /api/v1/site-context` -> resuelve PLATFORM/TENANT por hostname únicamente si existe binding verificado; `workers.dev`/QA resuelve a PLATFORM como service default.

## Regla de datos

No se duplican resultados por tenant. Los partidos continúan viviendo una sola vez en el núcleo deportivo y cada tenant obtiene una proyección filtrada por `club_id`.

Un marcador sólo aparece en la proyección del tenant si el read model público de campeonato lo considera publicable; estados no oficiales no filtran marcador.

## Regla de seguridad

- tenant != club deportivo: la relación es explícita por `tenants.club_id`;
- un `club_id` sólo puede pertenecer a un tenant dentro del esquema actual;
- dominios declarados no otorgan routing ni CORS dinámico;
- sólo bindings `VERIFIED + active` pueden habilitar resolución de host y origen web dinámico;
- ningún endpoint público expone identidad Telegram ni auditoría interna.

## Próximo gate

1. CI determinista del esquema, rutas, aislamiento y host binding.
2. Merge a `feature/sports-event-bus-v1`.
3. Migración D1 + deploy Worker.
4. Runtime externo de `/api/v1/platform`, `/api/v1/tenant/CUDO` y `/api/v1/tenant/CUDO/matches`.
5. Primer bloqueo humano legítimo: definir/verificar el hostname raíz de Fútbol Chépica y su control DNS antes de activar el binding de plataforma.
