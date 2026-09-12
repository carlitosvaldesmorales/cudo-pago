# Canonical Capability + Event Projection Architecture v1

Estado: ACTIVO
Ámbito: Fútbol Chépica / CUDO / Telegram / Web / API / Streaming

## Problema estructural

El producto acumuló flujos separados por actor y por canal para intenciones equivalentes. Eso genera duplicación de UX, handlers, QA, datos y evolución. La corrección no es sólo de software: es una regla de sistema.

Los siguientes conceptos NO definen un módulo ni una autoridad por sí solos:

- actor;
- persona;
- rol;
- canal;
- sitio;
- software consumidor (OBS, vMix u otro);
- handler;
- endpoint;
- tenant;
- organización consumidora.

## Orden obligatorio de diseño

Antes de elegir software o tecnología:

```text
PROBLEMA SISTÉMICO
        ↓
PATRÓN CONOCIDO
        ↓
INVARIANTES
        ↓
MODELO LÓGICO
        ↓
CONTRATOS
        ↓
TECNOLOGÍA / SOFTWARE
```

No se diseña desde `Telegram`, `OBS`, `vMix`, `Cloudflare` o una pantalla concreta. Primero se identifica qué comportamiento sistémico se necesita y luego se conecta la tecnología como adaptador o proyección.

## Invariantes

**ACTOR ≠ MÓDULO**

**CANAL ≠ MÓDULO**

**HANDLER ≠ MÓDULO**

**TENANT ≠ MÓDULO**

**PERSONA REAL ≠ REQUISITO PARA VALIDAR UNA CAPACIDAD SIMULABLE**

**POLICY ≠ FLUJO**

**PROYECCIÓN ≠ AUTORIDAD**

**MISMO SIGNIFICADO + MISMA INTENCIÓN HUMANA = UNA CAPACIDAD CANÓNICA**

**UN SCOPE SEMÁNTICO = UNA AUTORIDAD CANÓNICA**

**REFERENCE OVER COPY**: los consumidores referencian/componen estado y capacidades canónicas; no reciben una implementación semántica propia.

Una capacidad canónica puede ser consumida por múltiples actores y proyectada por múltiples canales sin duplicar su semántica.

## Control Plane / Data Plane / HMI

Telegram o una web administrativa son interfaces humanas (HMI/adaptadores) para operar capacidades; no son el Control Plane por sí mismos.

```text
HMI / ADAPTER
Telegram · Web · API
        ↓
CONTROL PLANE
intención + policy + scope + autoridad
        ↓
DATA PLANE
estado canónico + ejecución + eventos
        ↓
PROJECCIONES
Web · Telegram · API · Streaming
```

Cambiar la HMI o el software consumidor no debe cambiar la semántica del sistema.

## Unidad canónica

La arquitectura se organiza en cinco niveles:

```text
PRIMITIVAS
   ↓
CAPACIDADES CANÓNICAS
   ↓
MÓDULOS CONSUMIBLES
   ↓
POLÍTICA / SCOPE / PROVENANCE
   ↓
CANALES / PROYECCIONES
```

Ejemplo:

```text
seleccionar fecha
+ seleccionar partido
+ seleccionar serie
+ elegir marcador
+ confirmar
= RESULTS_REGISTER
```

`RESULTS_REGISTER` no pertenece a Chépica Play, CUDO, un dirigente ni al público. Es una capacidad de Fútbol Chépica.

## Política desacoplada

La misma experiencia puede producir consecuencias distintas según el actor:

```text
resultado_de_la_acción
=
capacidad_canónica
+ policy(actor)
+ scope(actor)
+ provenance(actor)
```

Ejemplo:

- público: aporta observación `SUBMITTED`;
- Chépica Play: aporta observación `SUBMITTED` con provenance de organización;
- dirigente autorizado: aplica la política definida para su club/competencia;
- operador: aplica gobierno según autoridad explícita.

La UX de captura no se duplica por esa diferencia.

Una sola identidad controlada puede recorrer escenarios distintos mediante contextos/policies sintéticos. Personas reales se reservan para certificación humana que no pueda simularse con suficiente fidelidad; no son un requisito artificial para probar el comportamiento canónico.

## Autoridad canónica

No basta con deduplicar UX o handlers. También debe existir una única autoridad por significado y scope.

```text
SIGNIFICADO + SCOPE
        ↓
AUTORIDAD CANÓNICA ÚNICA
        ↓
EVENTOS / SNAPSHOTS
        ↓
N PROYECCIONES
```

Una proyección JSON, una Sheet, un sitio, un tenant o un overlay no puede convertirse silenciosamente en una segunda fuente de verdad.

El inventario ejecutable está en `docs/architecture/system-authority-registry-v1.json` y CI valida su unicidad estructural.

## Event-Driven Architecture

No se usa polling como mecanismo principal de propagación.

```text
COMANDO
  ↓
mutación válida
  ↓
DOMAIN EVENT
  ↓
proyecciones interesadas
```

Si nada cambia, no existe trabajo periódico para descubrir cambios.

Eventos de resultado deben ser idempotentes, versionados y portar sólo los datos necesarios para que los consumidores actualicen su proyección incrementalmente.

Ejemplo conceptual:

```text
result.updated
{
  event_id,
  result_id,
  match_id,
  series_code,
  home_score,
  away_score,
  validation_status,
  version,
  occurred_at
}
```

## Proyecciones y late binding

Web, Telegram, API y streaming son consumidores/proyecciones del mismo estado, no fuentes independientes de verdad.

```text
                 ESTADO CANÓNICO
                       │
                 DOMAIN EVENTS
                       │
        ┌──────────────┼──────────────┐
        │              │              │
      Web/API       Telegram       Streaming
    read model      UX adapter     live overlay
                                      │
                                  OBS / vMix /
                                  consumidor futuro
```

La proyección para streaming recibe cambios por push (WebSocket/SSE o mecanismo equivalente), no consulta la API cada N segundos. OBS y vMix son consumidores intercambiables: ningún contrato de dominio depende de ellos.

## Snapshot / structural sharing

Un snapshot publicado representa referencias/versiones de estados canónicos, no una copia completa por consumidor.

```text
S42
 resultados → r31
 partidos   → p18
 equipos    → e7
 noticias   → n14

S43
 resultados → r32  # único delta
 partidos   → p18  # compartido
 equipos    → e7   # compartido
 noticias   → n14  # compartido
```

La implementación concreta puede usar materialized views, manifests/versiones o proyecciones derivadas. La regla es evitar duplicar semántica y estado por canal/tenant.

Para QA se aplica el mismo principio:

```text
SNAPSHOT BASE
     +
CAPACIDAD CANÓNICA
     +
MATRIZ DE POLICY/SCOPE
     ↓
DELTAS ESPERADOS
```

No se requieren N implementaciones ni N personas para probar N policies.

## CUDO y futbolchepica.cl

Fútbol Chépica es el dominio deportivo neutral. CUDO es un tenant/consumidor participante, no el centro del dominio común.

```text
FÚTBOL CHÉPICA
  ├── competencias
  ├── clubes
  ├── fixture
  ├── partidos
  ├── series
  ├── resultados
  ├── tabla
  └── estado deportivo compartido

CUDO
  ├── contenido editorial del club
  ├── plantel publicado por el club
  ├── socios
  ├── finanzas
  ├── infraestructura
  └── comunidad interna
```

Mismo sustantivo no implica mismo bounded context. Por ejemplo, `plantel CUDO` y un eventual registro de jugadores de campeonato sólo se unifican si significado, autoridad y objetivo son realmente iguales.

`cudo.cl` y `futbolchepica.cl` pueden proyectar datos compartidos, pero no deben duplicar las capacidades ni las autoridades canónicas.

## Evidencia de normalización del web V8

El Campeonato V8 ya consume `GET /api/v1/public-championship` desde Sports Event Bus y usa `championship-fixture.json` sólo como fallback snapshot. Por tanto ese snapshot no es autoridad.

El pipeline Google histórico todavía materializa `CUDO_WEB_PARTIDOS` y `CUDO_WEB_TABLA`. Se clasifican como `LEGACY_UNRESOLVED_NON_AUTHORITY`: no pueden competir con fixture/resultados/tabla canónicos de ANFA Chépica. No se eliminan hasta demostrar si resuelven un objetivo propio del club o si son material obsoleto.

## Regla para refactor

Antes de crear o modificar un flujo:

1. declarar el problema sistémico y la intención humana;
2. identificar el bounded context y scope semántico;
3. buscar la autoridad y capacidad canónica equivalentes;
4. si existen, reutilizarlas por referencia;
5. expresar diferencias como policy/scope/provenance/adaptador/proyección;
6. crear autoridad o capacidad nueva sólo si cambia el significado real;
7. publicar cambios mediante evento/delta;
8. actualizar únicamente las proyecciones afectadas;
9. falsar que no se creó una segunda autoridad, un segundo flujo o polling innecesario.

## Frontera

`RESULTS_REGISTER` es la primera vertical canónica `CONSUMABLE`:

```text
RESULTS_REGISTER
      ↓
canonical result/observation mutation
      ↓
result.updated / result.submitted
      ↓
read projection + streaming projection
```

La siguiente frontera de producto es `RESULTS-READ`: debe validar su contrato humano canónico antes de modificar sus runtimes existentes.
