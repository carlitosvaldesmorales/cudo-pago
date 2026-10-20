# RESULTS-GOVERN · Contrato de Secretaría v1

Estado: **APROBADO POR PRODUCTO · 2026-10-20**  
Canal inicial: Telegram · @FutbolChepicaBot  
Módulo canónico: `RESULTS-GOVERN`

## Intención humana

Resolver desde Telegram reclamos de Secretaría que cambian la tabla de posiciones sin falsear ni reescribir el marcador deportivo que efectivamente ocurrió.

## Invariante

`SECRETARIAT_POINTS_TRANSFER_PRESERVES_SCORE`

Una resolución de Secretaría que transfiere puntos:

- parte desde un resultado oficial `VERIFIED`;
- muestra el marcador y los puntos deportivos obtenidos por ambos clubes en la serie;
- permite seleccionar el club sancionado;
- calcula automáticamente los puntos realmente obtenidos por ese club;
- pide un motivo humano;
- muestra una confirmación explícita `-X / +X`;
- al confirmar, escribe ajustes de tabla y auditoría;
- conserva el marcador histórico sin cambios.

## Golden Path

### 1. Entrada desde Gobierno de resultados

```text
🧾 RESULTADO OFICIAL

Fecha I · Grupo A
San Juan 0–3 Juventud de Chépica
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

San Juan 0–3 Juventud de Chépica
Segunda

San Juan: 0 pts deportivos
Juventud de Chépica: 3 pts deportivos

[↔️ 3 pts · Juventud de Chépica → San Juan]
[⬅️ Resultado]
```

No se ofrece una transferencia desde un club que obtuvo 0 puntos.

### 3. Motivo

```text
🏛️ MOTIVO DEL RECLAMO

Se propone:
• Juventud de Chépica: -3 pts
• San Juan: +3 pts
• Marcador: se conserva 0–3

Escribe ahora el motivo de Secretaría.
```

### 4. Confirmación

```text
🏛️ CONFIRMAR RESOLUCIÓN DE SECRETARÍA

Fecha I · Segunda
San Juan 0–3 Juventud de Chépica

• Juventud de Chépica: -3 pts
• San Juan: +3 pts
• Marcador histórico: sin cambios
• Motivo: carnet vencido

[✅ Aplicar resolución]
[Cancelar]
```

### 5. Resultado

```text
✅ RESOLUCIÓN DE SECRETARÍA APLICADA

Juventud de Chépica: -3 pts
San Juan: +3 pts
Marcador 0–3: sin cambios

La Tabla de posiciones ya consume estos ajustes automáticamente.
```

## Cálculo de puntos

El monto transferido es el puntaje deportivo que el club sancionado obtuvo realmente en esa serie:

- Tercera: victoria 2, empate 1, derrota 0.
- Segunda: victoria 3, empate 1, derrota 0.
- Primera: victoria 4, empate 2, derrota 0.
- Senior: victoria 3, empate 1, derrota 0.

Esto significa que si Segunda terminó 1–1 y el club sancionado tenía 1 punto, el cambio administrativo es exactamente `-1 / +1`; no se inventa un triunfo de 3 puntos.

## Negativos obligatorios

1. CLUB_ADMIN no ve ni puede forzar la acción de Secretaría.
2. Resultado no VERIFIED no admite ajuste.
3. Club con 0 puntos deportivos no genera transferencia.
4. Cambio concurrente de marcador o governance version invalida la sesión.
5. Una resolución activa equivalente no puede aplicarse dos veces.
6. Cancelar no cambia la tabla.
7. Aplicar no cambia el marcador.
8. Cada resolución deja evento y `permission_audit`.
9. La tabla pública deriva de `public-standings-v2`; Telegram no recalcula posiciones.

## Persistencia

- Resolución: `secretariat_standings_resolutions`.
- Débito/crédito: `standings_adjustments`.
- Sesión temporal: `telegram_secretariat_sessions`.
- Auditoría: `permission_audit`.
- Evento: `standings.secretariat.points_transferred`.

## Evidencia requerida

- harness determinista del flujo y negativos;
- validación del Module Registry;
- deploy con migración D1;
- prueba de runtime Telegram/Worker;
- verificación de `public-standings-v2` posterior a ajustes reales.
