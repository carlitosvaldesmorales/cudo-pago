# FUTBOL-CHEPICA-MULTICLUB-01

Fecha de decisión: 2026-09-09

## Decisión arquitectónica

Desde este hito, las capacidades transversales de campeonato se modelan conceptualmente como **Fútbol Chépica** y no como funciones internas de CUDO.

- **Fútbol Chépica**: campeonato, clubes, fixture, resultados, tabla, dirigentes acreditados, incidencias y gobierno transversal.
- **CUDO / Unión Orilla**: primer club/tenant piloto productivo y consumidor del núcleo común.
- **cudo.cl**: conserva la identidad y contenido propio del Club Unión Deportivo Orilla.
- **Worker + API + D1**: se mantienen físicamente sin renombrar mientras no exista una razón técnica para hacerlo.
- **Telegram**: canal operacional multi-club. La identidad técnica del bot puede seguir temporalmente como CUDO Bot hasta el gate de marca/gobierno.

Esta transición evita dos extremos: seguir acoplando funciones transversales a CUDO o hacer un lanzamiento público multi-club antes de demostrarlo con evidencia real.

## Regla de lanzamiento

Fútbol Chépica NO se declara lanzamiento definitivo hasta cerrar los cinco gates. Los gates son binarios; no se usa un porcentaje agregado para compensar un bloqueo crítico.

| Gate | Alcance | Estado 2026-09-09 |
|---|---|---|
| G1 | Lifecycle dirigentes: listar, ver, suspender, reactivar, revocar | **PASS E2E REAL** — enrollment/RBAC/suspensión/reactivación comprobados; revocación/idempotencia/auditoría cubiertos por QA |
| G2 | Usuario público informa resultado: SUBMITTED → revisión → aprobar/rechazar → VERIFIED | **DESPLEGADO + QA PASS** — E2E Telegram real diferido: actualmente no hay una segunda identidad pública disponible para falsarlo sin mezclar roles |
| G3 | Resultado oficial seguro: corregir/versionar + disputar/anular + auditoría | **DESPLEGADO + QA PASS** — gate humano seguro de navegación pendiente; mutación real se difiere hasta existir un caso legítimo |
| G4 | Segundo club real: enrollment y operación real sin intervención técnica del equipo CUDO | GAP |
| G5 | Gobierno y marca: recuperación/segundo global admin + identidad neutral visible | GAP |

## Evidencia heredada ya validada

- Portal Telegram con entrada Público / Dirigentes.
- Solicitud de dirigente por club.
- PENDING → aprobación por SUPER_ADMIN.
- Usuario aprobado convertido a CLUB_ADMIN del club solicitado.
- RBAC de partidos por `club_id` validado visualmente con Unión Orilla.
- Lifecycle real: ACTIVO → SUSPENDIDO → acceso administrativo bloqueado → REACTIVADO → acceso restaurado.
- Resultados VERIFIED son la única fuente pública de resultados.
- Auditoría `permission_audit` ya existe.
- `reporters` ya dispone de `club_id`, `role`, `trust_level` y `active`.
- QA recurrente `TELEGRAM-QA-HARNESS-01` cubre enrollment, RBAC, score directo de CLUB_ADMIN, suspensión, callbacks viejos, reactivación, revocación e idempotencia.
- G2 dispone de QA específico que prueba `SUBMITTED` aislado, revisión por club participante, aprobación/rechazo, idempotencia y publicación sólo tras VERIFIED.
- G2 fue desplegado por `Deploy Sports Event Bus` run `34422788118` (#48), con migración `0008_public_result_submissions.sql`, esquema remoto validado y Worker versión `79454728-c85b-4ce1-adf3-27994bbdc911`.
- El deploy de G2 conservó la fuente deportiva en 24 series VERIFIED / 6 partidos; no insertó marcadores sintéticos.
- G3 detectó y cerró técnicamente un riesgo real: los handlers administrativos anteriores podían volver a ejecutar un UPSERT sobre una serie ya oficial.
- G3 agrega historia inmutable `match_series_result_versions`, estados `VERIFIED / DISPUTED / ANNULLED`, versionado y bloqueo del overwrite silencioso incluso para SUPER_ADMIN.
- `Validate Result Governance` run `34424510189` pasó G3 + regresión G2 + regresión G1 + migraciones + contratos de despliegue en conjunto.
- PR #10 pasó también los tres checks de PR: G3, G2 y harness Telegram G1.
- G3 fue desplegado por `Deploy Sports Event Bus` run `34424861780` (#49), con migración `0009_result_governance.sql` aplicada remotamente.
- Gate remoto G3: `invalid_governance_status=0`, `invalid_result_versions=0`, `missing_current_version=0`.
- El despliegue G3 mantuvo 24 series VERIFIED / 6 partidos; no alteró la fuente deportiva con datos de QA.
- Worker productivo G3: versión `4c4452fb-3964-4994-abf8-f589a6740bb1`.
- QA recurrente posterior al merge: `Validate Telegram QA Harness` run `34424861804`, SUCCESS.

## Patrón obligatorio para nuevas entidades

Antes de implementar una nueva capacidad se debe evaluar explícitamente:

1. Cómo nace.
2. Quién puede verla.
3. Quién puede modificarla.
4. Quién la aprueba.
5. Qué ocurre si está mal.
6. Qué ocurre si cambia.
7. Cómo se suspende.
8. Cómo se reactiva.
9. Cómo se revoca/anula sin perder historia.
10. Qué queda auditado.
11. Cómo se recupera el estado.

No todos los objetos usarán todos los estados, pero deben evaluarse antes de codificar el camino feliz.

## Separación conceptual

```text
FÚTBOL CHÉPICA
├── Campeonato
├── Clubes
├── Fixture / Fechas
├── Resultados / Tabla
├── Dirigentes acreditados
├── Incidencias / correcciones
└── Gobierno transversal

CLUB (ej. Unión Orilla / CUDO)
├── Historia
├── Noticias propias
├── Galería propia
├── Estadio / infraestructura
├── Socios
└── Administración interna
```

## Próximo orden de ejecución

1. **G1 cerrado.** Mantener su QA como regresión obligatoria.
2. **G2 desplegado y técnicamente validado.** E2E público queda diferido hasta disponer de una segunda identidad real o de un caso real que permita falsarlo sin contaminar producción.
3. **G3 desplegado y técnicamente validado.** Ejecutar únicamente el gate humano seguro de navegación/cancelación con la cuenta SUPER_ADMIN actual. Una mutación real se validará cuando exista un caso legítimo.
4. Incorporar un segundo club real para falsar G4 sin intervención técnica del equipo CUDO.
5. Cerrar G5: gobierno/recuperación e identidad neutral visible.

## Regla de evidencia

- **MATERIALIZADO** = existe en código/repositorio.
- **VALIDADO** = CI/prueba técnica demuestra contrato esperado.
- **DESPLEGADO** = código/migraciones están en runtime productivo y pasaron gates de deploy.
- **E2E VALIDADO** = comportamiento comprobado por un usuario/identidad real en runtime.
- **DIFERIDO** = gate legítimo que no puede falsarse hoy sin una dependencia externa o sin contaminar producción; no se cuenta como E2E cerrado.
- Nunca usar "listo" o "cerrado" si sólo existe código sin prueba runtime.
