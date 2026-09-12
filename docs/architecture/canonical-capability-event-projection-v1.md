# Canonical Capability + Event Projection Architecture v1

Estado: ACTIVO
Ámbito: Fútbol Chépica / CUDO / Telegram / Web / API / Streaming

## Problema estructural

El producto acumuló flujos separados por actor y por canal para intenciones equivalentes. Eso genera duplicación de UX, handlers, QA y evolución.

Los siguientes conceptos NO definen un módulo por sí solos:

- actor;
- rol;
- canal;
- sitio;
- handler;
- endpoint;
- tenant;
- organización consumidora.

## Invariantes

**ACTOR ≠ MÓDULO**

**CANAL ≠ MÓDULO**

**HANDLER ≠ MÓDULO**

**TENANT ≠ MÓDULO**

**MISMO SIGNIFICADO + MISMA INTENCIÓN HUMANA = UNA CAPACIDAD CANÓNICA**

Una capacidad canónica puede ser consumida por múltiples actores y proyectada por múltiples canales sin duplicar su semántica.

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

## Proyecciones

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
```

La proyección para streaming debe recibir cambios por push (por ejemplo WebSocket/SSE mediante un componente de broadcast), no consultar la API cada N segundos.

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
  ├── planteles deportivos
  └── contenido deportivo

CUDO
  ├── administración interna del club
  ├── socios
  ├── finanzas
  ├── infraestructura
  └── comunidad interna
```

`cudo.cl` y `futbolchepica.cl` pueden proyectar datos compartidos, pero no deben duplicar las capacidades canónicas.

## Regla para refactor

Antes de crear o modificar un flujo:

1. declarar la intención humana;
2. buscar capacidad canónica equivalente;
3. si existe, reutilizarla;
4. expresar diferencias como policy/scope/provenance/adaptador;
5. crear una capacidad nueva sólo si cambia el significado o el objetivo humano;
6. publicar cambios mediante evento;
7. actualizar únicamente las proyecciones afectadas.

## Frontera inmediata

La primera vertical canónica para producción es:

```text
RESULTS_REGISTER
      ↓
canonical result/observation mutation
      ↓
result.updated / result.submitted
      ↓
read projection + streaming projection
```

No se implementan variantes `PUBLIC_RESULTS_REGISTER`, `CP_RESULTS_REGISTER` o `CLUB_ADMIN_RESULTS_REGISTER` como productos distintos.
