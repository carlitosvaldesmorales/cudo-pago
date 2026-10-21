# Telegram · Expulsados por partido / registro disciplinario v1

Estado: **MATERIALIZADO · sujeto a certificación de runtime por deploy**
Dominio: ANFA Chépica 2026 / Sports Event Bus
Capacidad autorizadora reutilizada: `PUBLISH_MATCH_EVENT`

## Intención

Registrar desde Telegram los jugadores expulsados en cada partido para conservar
un historial disciplinario auditable, sin mezclar ese hecho con el marcador y sin
inventar automáticamente sanciones reglamentarias no materializadas para el
campeonato actual.

## Golden Path

`Registrar resultados → Fecha → Partido → 🟥 Expulsados → Registrar expulsado`

1. Seleccionar serie.
2. Seleccionar club local o visita.
3. Escribir nombre del jugador expulsado.
4. Seleccionar tipo:
   - 🟥 Roja directa.
   - 🟨🟨 Doble amarilla.
   - ⚠️ Otra expulsión informada.
5. Revisar.
6. Confirmar.

El partido puede tener cero, uno o varios expulsados.

## Persistencia

Tabla canónica:

`match_disciplinary_incidents`

Cada registro conserva:

- competición y temporada;
- partido;
- serie;
- club;
- nombre declarado del jugador;
- clave normalizada del nombre para evitar duplicados obvios;
- tipo de expulsión;
- estado del registro;
- estado de sanción;
- actor y fuente;
- timestamps;
- datos de anulación si corresponde.

Estado inicial de sanción:

`RECORDED_PENDING_RULE_DECISION`

Esto significa que el **hecho de la expulsión está registrado**, pero todavía no
se infiere de ese hecho una cantidad de fechas, multa, elegibilidad, pérdida de
puntos u otra consecuencia.

## Autoridad

El contrato vigente ya declara `PUBLISH_MATCH_EVENT` para `SUPER_ADMIN`.

La v1 usa esa capacidad sin ampliarla:

- SUPER_ADMIN verificado: puede registrar, ver y anular expulsiones.
- CLUB_ADMIN: no obtiene esta capacidad por inferencia.
- Chépica Play / MEDIA_PARTNER: continúa fuera de match-event capture.
- Público: sin escritura disciplinaria.

La ampliación de autoridad a otro actor debe aprobarse explícitamente.

## UX de seguimiento

El ADMIN GLOBAL muestra:

`🟥 Expulsados / sanciones (N)`

Ese registro lista los hechos disciplinarios conservados y permite abrir su
detalle.

Desde cada partido aparece:

`🟥 Expulsados (N)`

El detalle muestra jugador, club, partido, fecha, serie, tipo y estado.

## Invariantes

`EXPULSION_FACT_NEQ_SANCTION_DECISION`

- registrar una expulsión no altera el marcador;
- registrar una expulsión no altera la tabla;
- registrar una expulsión no crea una multa;
- registrar una expulsión no define fechas de suspensión;
- registrar una expulsión no determina elegibilidad futura;
- no se crea identidad de jugador canónica por inferencia;
- mientras no exista un registro canónico de jugadores del campeonato, el nombre
  es una declaración textual normalizada;
- un mismo nombre normalizado no puede quedar dos veces activo para el mismo
  partido + serie + club;
- anular no borra: cambia el estado a `VOID` y conserva auditoría.

## Eventos

Alta:

`match.player.expelled`

Anulación:

`match.player.expulsion.voided`

## Auditoría

Alta:

`REGISTER_MATCH_EXPULSION`

Anulación:

`VOID_MATCH_EXPULSION`

## Fuentes / límites

ARKĒ ya contenía:

- trigger `PLAYER_EXPELLED`;
- regla conceptual `RULE_CARD_SANCTION`;
- evidencia histórica de doble amarilla / roja directa en bases de torneos CUDO;
- GAP explícito `real_sanction_incident_ingestion_not_yet_discovered`.

Esas reglas históricas **no se generalizan** al campeonato ANFA Chépica 2026.
Por eso v1 materializa sólo la ingesta disciplinaria real.

## Evidencia ejecutable

- `sports-bus/migrations/0031_match_discipline_expulsions.sql`
- `sports-bus/worker/match-discipline-entry.js`
- `sports-bus/worker/results-register-v2-entry.js`
- `sports-bus/worker/telegram-dirigentes-home-entry.js`
- `qa/telegram/match-discipline-expulsions-harness.mjs`
- `qa/telegram/results-register-canonical-harness.mjs`
- `qa/telegram/dirigentes-home-canonical-harness.mjs`

## GAP restante

1. No existe en Sports Event Bus un registro canónico de jugadores de todos los
   clubes del campeonato. Por ahora el jugador se identifica por nombre declarado.
2. No existe aún una policy normativa materializada para convertir cada expulsión
   en suspensión, multa o elegibilidad.
3. No se ampliaron permisos a CLUB_ADMIN; requiere decisión humana explícita.
