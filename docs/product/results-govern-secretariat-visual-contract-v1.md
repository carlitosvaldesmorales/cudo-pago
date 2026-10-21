# RESULTS-GOVERN · Contrato de Secretaría v2

Estado: **APROBADO POR PRODUCTO · CORREGIDO 2026-10-21**
Canal inicial: Telegram · @FutbolChepicaBot
Módulo canónico: `RESULTS-GOVERN`
Política administrativa: `AWARD_OPPONENT_WIN`

## Intención humana

Resolver desde Telegram reclamos de Secretaría que cambian la tabla de posiciones sin falsear ni reescribir el marcador deportivo que efectivamente ocurrió.

## Invariante

`SECRETARIAT_AWARD_WIN_PRESERVES_SCORE`

Una resolución de Secretaría que adjudica el partido al rival:

- parte desde un resultado oficial `VERIFIED`;
- muestra el marcador y los puntos obtenidos en cancha por ambos clubes;
- permite seleccionar el club sancionado;
- calcula los puntos objetivo reglamentarios de esa serie;
- sancionado → puntos de derrota;
- beneficiado → puntos de victoria;
- calcula un delta independiente para cada club;
- pide un motivo humano;
- muestra confirmación explícita de puntos antes → objetivo;
- al confirmar, escribe ajustes de tabla y auditoría;
- conserva el marcador histórico sin cambios.

## Golden Path

### 1. Entrada

```text
🧾 RESULTADO OFICIAL

Fecha III · Grupo A
Santa Elena La Ruda 1–1 Juventud de Chépica
Segunda

✅ Oficial

[✏️ Corregir marcador]
[🏛️ Reclamo Secretaría]
[⚠️ Poner en disputa]
[🚫 Anular resultado]
```

La acción de Secretaría sólo aparece a `SUPER_ADMIN` verificado.

### 2. Selección del club sancionado

```text
🏛️ RECLAMO DE SECRETARÍA

Santa Elena La Ruda 1–1 Juventud de Chépica
Segunda

Santa Elena La Ruda: 1 pt en cancha
Juventud de Chépica: 1 pt en cancha

[🏛️ Dar triunfo a Santa Elena La Ruda · -1 / +2]
[🏛️ Dar triunfo a Juventud de Chépica · -1 / +2]
[⬅️ Resultado]
```

### 3. Motivo

```text
🏛️ MOTIVO DEL RECLAMO

Se propone adjudicar administrativamente la victoria a Santa Elena La Ruda:
• Juventud de Chépica: 1 → 0 pts (-1)
• Santa Elena La Ruda: 1 → 3 pts (+2)
• Marcador: se conserva 1–1

Escribe ahora el motivo de Secretaría.
```

### 4. Confirmación

```text
🏛️ CONFIRMAR RESOLUCIÓN DE SECRETARÍA

Fecha III · Segunda
Santa Elena La Ruda 1–1 Juventud de Chépica

Fallo: victoria administrativa para Santa Elena La Ruda
• Juventud de Chépica: 1 → 0 pts (-1)
• Santa Elena La Ruda: 1 → 3 pts (+2)
• Marcador histórico: sin cambios
• Motivo: ...

[✅ Aplicar resolución]
[Cancelar]
```

### 5. Resultado

```text
✅ RESOLUCIÓN DE SECRETARÍA APLICADA

Victoria administrativa para Santa Elena La Ruda
Juventud de Chépica: 1 → 0 pts (-1)
Santa Elena La Ruda: 1 → 3 pts (+2)
Marcador 1–1: sin cambios

La Tabla de posiciones ya consume estos ajustes automáticamente.
```

## Cálculo de puntos

La decisión administrativa fija el resultado **en puntos de tabla**, no transfiere el puntaje que el sancionado obtuvo en cancha.

- Tercera: victoria 2, empate 1, derrota 0.
- Segunda: victoria 3, empate 1, derrota 0.
- Primera: victoria 4, empate 2, derrota 0.
- Senior: victoria 3, empate 1, derrota 0.

Para cada club:

`delta = puntos_objetivo_administrativo - puntos_obtenidos_en_cancha`

Ejemplo Segunda 1–1:
- sancionado: `0 - 1 = -1`;
- beneficiado: `3 - 1 = +2`.

## Negativos obligatorios

1. CLUB_ADMIN no ve ni puede forzar la acción de Secretaría.
2. Resultado no VERIFIED no admite ajuste.
3. Un fallo que ya coincide con los puntos deportivos no duplica ajustes.
4. Cambio concurrente de marcador o governance version invalida la sesión.
5. Una resolución activa equivalente no puede aplicarse dos veces.
6. Cancelar no cambia la tabla.
7. Aplicar no cambia el marcador.
8. Cada resolución deja evento y `permission_audit`.
9. La tabla pública deriva de `public-standings-v2`; Telegram no recalcula posiciones.
10. Un empate adjudicado nunca usa `-1/+1` por simple transferencia: usa los puntos objetivo de derrota/victoria.

## Persistencia

- Resolución: `secretariat_standings_resolutions`.
- Política: `resolution_policy = AWARD_OPPONENT_WIN`.
- Débito/crédito: `standings_adjustments`.
- Sesión temporal: `telegram_secretariat_sessions`.
- Auditoría: `permission_audit`.
- Evento nuevo: `standings.secretariat.win_awarded`.
- Corrección histórica: `standings.secretariat.award_win.corrected`.

## Evidencia requerida

- harness determinista del flujo y del caso empate 1–1 → -1/+2;
- validación del Module Registry;
- deploy con migración D1;
- prueba de runtime Telegram/Worker;
- verificación de `public-standings-v2` posterior a la corrección real.
