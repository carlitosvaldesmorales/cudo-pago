# Secretaría → ajustes de tabla por Telegram — v1

Estado: **MATERIALIZADO**
Dominio: ANFA Chépica 2026 / Sports Event Bus
Autoridad de tabla: `public-standings-v2`

## Intención

Permitir que una resolución de Secretaría que afecta puntos se aplique desde Telegram sin alterar el marcador histórico del partido y sin recalcular la tabla fuera del backend canónico.

## Invariante principal

`SECRETARIAT_POINTS_TRANSFER_PRESERVES_SCORE`

Una resolución administrativa de puntos:

- conserva `match_series_results.home_score / away_score`;
- conserva el estado oficial del resultado cuando el marcador sigue siendo válido;
- escribe deltas explícitos en `standings_adjustments`;
- registra una resolución en `secretariat_standings_resolutions`;
- registra evento y `permission_audit`;
- deja que `public-standings-v2` recalcule posición y puntaje.

## Actor

La escritura está limitada a `SUPER_ADMIN` verificado.

No se crea un rol paralelo “Secretaría”. Secretaría es el tipo de resolución; la identidad que la ejecuta sigue pasando por RBAC vigente y por `GOVERN_RESULTS`.

## Flujo Telegram

`Dirigentes → Gobierno de resultados → Partido → Serie → 🏛️ Reclamo Secretaría`

1. Telegram muestra el marcador oficial y los puntos deportivos obtenidos por cada club en esa serie.
2. El SUPER_ADMIN selecciona el club sancionado.
3. El sistema calcula automáticamente el monto a transferir según la serie y el marcador:
   - Tercera: 2/1/0.
   - Segunda: 3/1/0.
   - Primera: 4/2/0.
   - Senior: 3/1/0.
4. El SUPER_ADMIN escribe el motivo.
5. Telegram muestra una confirmación explícita `-X / +X`.
6. Al confirmar se escriben atómicamente:
   - resolución de Secretaría;
   - débito `-X` al club sancionado;
   - crédito `+X` al rival;
   - evento;
   - auditoría.
7. El marcador no cambia.
8. `public-standings-v2` incorpora ambos ajustes automáticamente.

## Regla importante para empates

El sistema transfiere **los puntos realmente obtenidos por el club sancionado**, no el máximo posible de la serie.

Ejemplo: Segunda termina 1–1. Cada club tiene 1 punto deportivo. Si Secretaría ordena transferir los puntos del club sancionado al rival, el cambio es `-1 / +1`.

## Guardas

- Sólo resultados `VERIFIED`.
- Sólo `SUPER_ADMIN` verificado.
- Confirmación humana antes de escribir.
- Control de versión del resultado para detectar cambios concurrentes.
- Bloqueo de resolución activa duplicada sobre la misma serie y dirección.
- Los comandos nuevos limpian una sesión de Secretaría pendiente.
- No existe fallback que cambie el marcador para representar una sanción.

## Evidencia ejecutable

- `sports-bus/worker/secretariat-standings-entry.js`
- `sports-bus/migrations/0029_secretariat_standings_resolutions.sql`
- `qa/telegram/secretariat-standings-adjustment-harness.mjs`
- `.github/workflows/validate-results-register-canonical.yml`
