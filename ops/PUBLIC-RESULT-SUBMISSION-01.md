# PUBLIC-RESULT-SUBMISSION-01

Fecha: 2026-09-09
Gate: G2 de `FUTBOL-CHEPICA-MULTICLUB-01`
Estado actual: MATERIALIZADO + QA AUTOMATIZADO PASS / E2E TELEGRAM REAL PENDIENTE

## Contrato

Un usuario público puede informar un resultado, pero ese aporte **no es oficial** mientras permanezca `SUBMITTED`.

```text
USUARIO PÚBLICO
  → selecciona fecha / partido / serie
  → informa marcador
  → SUBMITTED
  → no aparece en API pública
  → no afecta tabla
  → dirigente de cualquiera de los dos clubes participantes o SUPER_ADMIN revisa
       ├─ APPROVE → VERIFIED → match_series_results → API pública
       └─ REJECT  → REJECTED → no modifica fuente de verdad
```

No existe confirmación obligatoria del club rival. El criterio vigente es que un `CLUB_ADMIN` verificado de cualquiera de los dos clubes participantes puede revisar el aporte. `SUPER_ADMIN` puede revisar todos.

## Persistencia

Migración `sports-bus/migrations/0008_public_result_submissions.sql`:

- `public_result_submissions`: historial y estados del aporte público.
- `telegram_public_result_sessions`: sesión temporal mientras se escribe el marcador.
- un mismo usuario no puede mantener dos `SUBMITTED` simultáneos para el mismo partido/serie.
- varios usuarios distintos sí pueden aportar sobre la misma serie; al aprobar uno, los demás pendientes quedan `SUPERSEDED`.

La tabla pública `match_series_results` sólo recibe un aporte público después de aprobación y con:

- `validation_status=VERIFIED`
- `source_type=TELEGRAM_PUBLIC_APPROVED`
- `source_ref=<submission_id>`

## Autorización

Puede revisar/aprobar/rechazar:

- `SUPER_ADMIN` activo y VERIFIED.
- `CLUB_ADMIN` activo y VERIFIED si su `club_id` coincide con local o visita del partido.

No puede:

- un usuario público;
- un dirigente de un tercer club;
- un administrador suspendido;
- la misma identidad que realizó el aporte, para autoaprobarse.

Las denegaciones y transiciones relevantes se registran en `permission_audit`.

## Protecciones operacionales

- `SUBMITTED` nunca entra en `/api/v1/series-results`.
- un aporte público no puede reemplazar un resultado ya existente.
- aprobación repetida es idempotente.
- si dos aportes compiten, sólo uno puede ocupar la restricción única de `match_series_results`; los demás se cierran como `SUPERSEDED`.
- máximo 8 aportes pendientes por usuario para limitar abuso básico.
- un dirigente verificado que entra por el flujo público es redirigido al flujo oficial `Dirigentes → Mis partidos`.

## QA automatizado

Harness: `qa/telegram/public-result-harness.mjs`.

Ejecuta el mismo `sports-bus/cors-entry.js` con Telegram simulado y D1 efímero SQLite. Comprueba:

- aislamiento `SUBMITTED` / API pública;
- notificaciones sólo a revisores autorizados;
- idempotencia del aporte;
- aportes independientes de distintos usuarios;
- rechazo de dirigente ajeno al partido;
- cola filtrada por club;
- aprobación `→ VERIFIED → API`;
- `SUPERSEDED` de aportes alternativos;
- idempotencia de aprobación;
- no sobrescritura de resultado oficial;
- rechazo por el dirigente del club visitante;
- regresión completa de G1.

Evidencia técnica actual: workflow `Validate Public Result Submission`, run `34422510562`, SUCCESS completo para G2 + regresión G1 + API VERIFIED-only.

## Gate de despliegue

El workflow de despliegue exige ahora:

- existencia de `public_result_submissions`;
- existencia de `telegram_public_result_sessions`;
- cero estados inválidos en aportes;
- toda serie devuelta por la API pública con `validation_status=VERIFIED`.

## Primer bloqueante humano residual

Después del deploy productivo falta falsar únicamente lo que CI no puede certificar: entrega/render en un cliente Telegram autenticado y operación entre identidades reales.

Prueba segura mínima sin contaminar resultado oficial:

1. una cuenta pública real entra a `Público → Informar resultado`;
2. navega hasta una serie sin resultado oficial;
3. valida que Telegram llegue a `Escribe el marcador...`;
4. pulsa `Cancelar` sin enviar marcador.

Para cerrar G2 E2E completo se necesita posteriormente **un resultado real aún no registrado**, informado desde una cuenta pública y aprobado/rechazado por un dirigente autorizado. No se usarán marcadores ficticios en D1 productivo.
