# RESULTS-REGISTER · Contrato visual v1

Estado: APROBADO POR PRODUCTO · 2026-09-11
Canal inicial: Telegram
Principio: mínima carga cognitiva, máxima selección por botones, cero texto libre en Golden Path.

## Invariante

La captura visual es única para todos los consumidores de `RESULTS-REGISTER`.

No existe una UX distinta por ser público, dirigente, Chépica Play, operador o superadministrador. La política posterior decide scope, authority, status y provenance.

## Golden Path

### Pantalla 1 · Entrada

```text
📝 REGISTRAR RESULTADO

Selecciona la fecha:

[⚽ Fecha 3]
[⚽ Fecha 4]
...
[🏠 Inicio]
```

Para la operación del domingo, la plataforma puede priorizar visualmente la Fecha 3 sin crear un módulo especial.

### Pantalla 2 · Partido

```text
📅 FECHA 3

Selecciona el partido:

[Club A — Club B]
[Club C — Club D]
[Club E — Club F]

[⬅️ Fechas]
[❌ Cancelar]
```

Sólo aparecen partidos válidos dentro del scope del actor. El usuario no escribe ni busca identificadores.

### Pantalla 3 · Serie

```text
⚽ Club A — Club B

Selecciona la serie:

[3ª]
[2ª]
[Senior]
[1ª]

[⬅️ Partidos]
[❌ Cancelar]
```

Cuando una serie tenga estado relevante, el botón puede incluir un indicador visual sin exponer estados técnicos internos.

### Pantalla 4 · Marcador local

```text
🏠 CLUB A
Selecciona sus goles:

[0] [1] [2] [3]
[4] [5] [6] [7]
[8+]

Marcador: Club A ? — ? Club B

[⬅️ Serie]
[❌ Cancelar]
```

No se solicita escribir `2-1`.

### Pantalla 5 · Marcador visita

```text
🚗 CLUB B
Selecciona sus goles:

[0] [1] [2] [3]
[4] [5] [6] [7]
[8+]

Marcador: Club A 2 — ? Club B

[⬅️ Local]
[❌ Cancelar]
```

### Pantalla 5A · Marcador alto

Sólo aparece si se pulsa `8+`.

```text
⚽ Goles: 8

[➖] [➕]
[✅ Usar 8]
[❌ Cancelar]
```

Existe una única acción de confirmación del valor.

### Pantalla 6 · Confirmación

```text
🧾 CONFIRMAR RESULTADO

Fecha 3
1ª
Club A 2 — 1 Club B

¿El marcador es correcto?

[✅ Confirmar]
[✏️ Cambiar marcador]
[❌ Cancelar]
```

No se muestra al usuario si su identidad tiene una política `SUBMITTED`, `VERIFIED` u otra antes de confirmar. Esa decisión pertenece al policy layer.

### Pantalla 7 · Estado final

El texto se adapta a la consecuencia de la política, manteniendo el mismo módulo de captura.

Ejemplo aporte sujeto a validación:

```text
✅ RESULTADO RECIBIDO

Club A 2 — 1 Club B
1ª · Fecha 3

Quedó enviado para validación.

[📝 Registrar otro resultado]
[📊 Ver resultados]
[🏠 Inicio]
```

Ejemplo actor con autoridad oficial:

```text
✅ RESULTADO REGISTRADO

Club A 2 — 1 Club B
1ª · Fecha 3

El resultado quedó registrado.

[📝 Registrar otro resultado]
[📊 Ver resultados]
[🏠 Inicio]
```

## Negativos obligatorios

1. Doble toque / callback repetido: no duplica mutación.
2. Callback stale después de cancelar/cambiar: falla cerrado y no revive sesión.
3. Partido/serie fuera de scope: nunca aparece como opción y una callback forjada es rechazada.
4. Resultado cambiado concurrentemente: no sobrescribe silenciosamente; aplica política de conflicto/gobierno.
5. Score alto: una sola confirmación semántica por estado visual.

## Contrato cognitivo

- Golden Path sin escritura manual.
- Una pregunta por pantalla.
- Botones representan opciones válidas, no comandos técnicos.
- Partido, serie y marcador permanecen visibles al confirmar.
- Navegación atrás y cancelar son explícitas.
- No se muestran IDs, roles técnicos, capability names ni estados internos innecesarios.
- El actor no necesita saber cómo se gobierna internamente el dato para registrar el marcador.

## Gate

Contrato APROBADO por producto el 2026-09-11. La implementación puede comenzar contra este contrato. La certificación de producto continúa bloqueada hasta completar implementación canónica, QA/MOF+, deploy y evidencia de runtime.
