# Secretaría → adjudicación administrativa de puntos por Telegram — v2

Estado: **MATERIALIZADO**
Dominio: ANFA Chépica 2026 / Sports Event Bus
Autoridad de tabla: `public-standings-v2`
Política: `AWARD_OPPONENT_WIN`

## Intención

Permitir que una resolución de Secretaría que declara ganador a un club se aplique desde Telegram sin alterar el marcador histórico del partido y sin recalcular la tabla fuera del backend canónico.

## Invariante principal

`SECRETARIAT_AWARD_WIN_PRESERVES_SCORE`

Una resolución administrativa:

- conserva `match_series_results.home_score / away_score` como resultado ocurrido en cancha;
- conserva el estado oficial del marcador cuando éste sigue siendo evidencia válida;
- lleva al club sancionado a los **puntos de derrota** de esa serie;
- lleva al club beneficiado a los **puntos de victoria** de esa serie;
- escribe sólo los deltas necesarios en `standings_adjustments`;
- registra la política y los puntos antes/objetivo/delta en `secretariat_standings_resolutions`;
- registra evento y `permission_audit`;
- deja que `public-standings-v2` recalcule posición y puntaje.

## Actor

La escritura está limitada a `SUPER_ADMIN` verificado.

No se crea un rol paralelo “Secretaría”. Secretaría es el tipo de resolución; la identidad que la ejecuta sigue pasando por RBAC vigente y por `GOVERN_RESULTS`.

## Flujo Telegram

`Dirigentes → Gobierno de resultados → Partido → Serie → 🏛️ Reclamo Secretaría`

1. Telegram muestra el marcador oficial y los puntos obtenidos en cancha por cada club.
2. El SUPER_ADMIN selecciona el club sancionado.
3. El sistema calcula el fallo administrativo según la serie:
   - Tercera: victoria 2 / empate 1 / derrota 0.
   - Segunda: victoria 3 / empate 1 / derrota 0.
   - Primera: victoria 4 / empate 2 / derrota 0.
   - Senior: victoria 3 / empate 1 / derrota 0.
4. El sancionado queda con los puntos de derrota.
5. El rival queda con los puntos de victoria.
6. El sistema calcula los deltas contra lo que cada club ya obtuvo en cancha.
7. El SUPER_ADMIN escribe el motivo.
8. Telegram muestra confirmación con puntos antes → objetivo y delta de cada club.
9. Al confirmar se escriben atómicamente resolución, ajustes, evento y auditoría.
10. El marcador no cambia.
11. `public-standings-v2` incorpora los ajustes automáticamente.

## Regla crítica para empates

Los puntos de un empate **no se transfieren ni se dividen de nuevo**.

Ejemplo: Segunda termina 1–1.

En cancha:
- club sancionado: 1 punto;
- rival: 1 punto.

Si Secretaría adjudica el partido al rival:
- sancionado: 1 → 0, delta **−1**;
- beneficiado: 1 → 3, delta **+2**.

El marcador histórico sigue siendo 1–1.

## Casos de referencia

### Ganador en cancha sancionado

Segunda: San Juan 0–3 Juventud de Chépica.

Si Juventud es sancionado:
- Juventud: 3 → 0 = **−3**;
- San Juan: 0 → 3 = **+3**.

### Empate con victoria administrativa

Segunda: Santa Elena La Ruda 1–1 Juventud de Chépica.

Si Juventud es sancionado y Secretaría da ganador a La Ruda:
- Juventud: 1 → 0 = **−1**;
- Santa Elena: 1 → 3 = **+2**.

## Persistencia

`secretariat_standings_resolutions` conserva:

- `resolution_policy = AWARD_OPPONENT_WIN`;
- puntos del sancionado antes, objetivo y delta;
- puntos del beneficiado antes, objetivo y delta;
- marcador fuente y governance version;
- motivo, actor y trazabilidad.

`points_amount` se conserva sólo por compatibilidad con el esquema v1 y representa el valor objetivo de victoria para nuevas resoluciones.

Los deltas efectivos de tabla están en `standings_adjustments`.

## Guardas

- Sólo resultados `VERIFIED`.
- Sólo `SUPER_ADMIN` verificado.
- Confirmación humana antes de escribir.
- Control de versión del resultado para detectar cambios concurrentes.
- Bloqueo de resolución activa duplicada sobre la misma serie y dirección.
- Las sesiones creadas bajo una política anterior no sobreviven a la migración.
- No existe fallback que cambie el marcador.
- El navegador/Telegram no calcula posiciones: sólo `public-standings-v2`.

## Evidencia ejecutable

- `sports-bus/worker/secretariat-standings-entry.js`
- `sports-bus/migrations/0029_secretariat_standings_resolutions.sql`
- `sports-bus/migrations/0030_secretariat_awarded_win_policy.sql`
- `qa/telegram/secretariat-standings-adjustment-harness.mjs`
- `.github/workflows/validate-results-register-canonical.yml`
