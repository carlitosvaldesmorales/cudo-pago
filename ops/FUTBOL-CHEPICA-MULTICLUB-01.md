# FUTBOL-CHEPICA-MULTICLUB-01

Fecha de decisión: 2026-09-09

## Decisión arquitectónica

Desde este hito, las capacidades transversales de campeonato se modelan conceptualmente como **Fútbol Chépica** y no como funciones internas de CUDO.

- **Fútbol Chépica**: campeonato, clubes, fixture, resultados, tabla, dirigentes acreditados, incidencias y gobierno transversal.
- **CUDO / Unión Orilla**: primer club/tenant piloto productivo y consumidor del núcleo común.
- **cudo.cl**: conserva la identidad y contenido propio del Club Unión Deportivo Orilla.
- **Worker + API + D1**: se mantienen físicamente sin renombrar mientras no exista una razón técnica para hacerlo.
- **Telegram**: canal operacional multi-club. La identidad visible productiva ya es `Fútbol Chépica`; el núcleo técnico compartido se mantiene sin duplicar infraestructura.

Esta transición evita dos extremos: seguir acoplando funciones transversales a CUDO o hacer un lanzamiento público multi-club antes de demostrarlo con evidencia real.

## Regla de lanzamiento

Fútbol Chépica NO se declara lanzamiento definitivo hasta cerrar los cinco gates. Los gates son binarios; no se usa un porcentaje agregado para compensar un bloqueo crítico.

| Gate | Alcance | Estado 2026-09-10 |
|---|---|---|
| G1 | Lifecycle dirigentes: listar, ver, suspender, reactivar, revocar | **PASS E2E REAL + QA** — enrollment/RBAC/suspensión/reactivación comprobados; revocación/idempotencia/auditoría cubiertos por QA ejecutable |
| G2 | Usuario público informa resultado: SUBMITTED → revisión → aprobar/rechazar → VERIFIED | **DESPLEGADO + QA PASS** — E2E Telegram real diferido hasta disponer de una segunda identidad pública o un caso real legítimo |
| G3 | Resultado oficial seguro: corregir/versionar + disputar/anular + auditoría | **DESPLEGADO + QA PASS + NAVEGACIÓN HUMANA SEGURA PASS** — mutación real diferida hasta existir un caso legítimo |
| G4 | Segundo club real: enrollment y operación real sin intervención técnica del equipo CUDO | GAP |
| G5 | Gobierno y marca: recuperación/segundo global admin + identidad neutral visible | PARCIAL — identidad visible Fútbol Chépica y bot destino validados; recuperación/segundo global admin sigue GAP |

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
- G1 dispone además de un harness dedicado que ejecuta listar/detalle/suspender/reactivar/revocar, conservación de identidad, auditoría, idempotencia y protección de SUPER_ADMIN.
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
- 2026-09-10: validación humana segura de G3 PASS en el bot productivo `Fútbol Chépica`: `/correcciones` mostró lista de resultados, se abrió un resultado oficial real y el detalle renderizó versión, estado, marcador y acciones de SUPER_ADMIN sin ejecutar ninguna mutación.
- La validación humana G3 dejó un hallazgo UX separado: la lista es ambigua porque no muestra clubes y expone nomenclatura técnica (`VERIFIED`, `v1`). No reabre el contrato funcional.

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

1. **G1 cerrado funcionalmente.** Mantener QA como regresión obligatoria; E2E adicional con segunda cuenta no bloquea.
2. **G2 desplegado y técnicamente validado.** E2E público queda diferido hasta disponer de una segunda identidad real o de un caso real que permita falsarlo sin contaminar producción.
3. **G3 navegación humana segura cerrada.** Una mutación real se validará sólo cuando exista una corrección, disputa o anulación legítima.
4. **Corregir UX de gobierno de resultados** como mejora independiente: hacer identificables los clubes en la lista, traducir estados técnicos y jerarquizar acciones de riesgo.
5. Incorporar un segundo club real para falsar G4 sin intervención técnica del equipo CUDO.
6. Cerrar el GAP restante de G5: segundo SUPER_ADMIN / recuperación de control.

## Regla de evidencia

- **MATERIALIZADO** = existe en código/repositorio.
- **VALIDADO** = CI/prueba técnica demuestra contrato esperado.
- **DESPLEGADO** = código/migraciones están en runtime productivo y pasaron gates de deploy.
- **E2E VALIDADO** = comportamiento comprobado por un usuario/identidad real en runtime.
- **DIFERIDO** = gate legítimo que no puede falsarse hoy sin una dependencia externa o sin contaminar producción; no se cuenta como E2E cerrado.
- Nunca usar "listo" o "cerrado" si sólo existe código sin prueba runtime.
