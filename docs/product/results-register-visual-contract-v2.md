# RESULTS-REGISTER · Contrato de interacción v2

Estado: APROBADO POR PRODUCTO · 2026-09-12
Canal inicial: Telegram
Supersede: `results-register-visual-contract-v1.md` para nuevas implementaciones.
Principio: el partido es la unidad de trabajo humana; la serie es la unidad de persistencia.

## Invariante

Existe una sola capacidad canónica `RESULTS-REGISTER` para PUBLIC, CLUB_ADMIN, CHEPICA_PLAY, PLATFORM_OPERATOR y SUPER_ADMIN. Scope, authority, submission status y provenance son policy; no alteran la estructura del Golden Path.

Telegram actúa como adaptador transaccional. Durante la carga usa un único mensaje vivo (`editMessageText` / `editMessageReplyMarkup`) cuando Telegram lo permite. No debe crear un mensaje nuevo por cada score, confirmación o retorno.

## Golden Path

### 1. Fecha

```text
📝 REGISTRAR RESULTADOS

Selecciona la fecha:
[⚽ Fecha 3]
...
```

### 2. Partido

```text
📅 FECHA 3

Selecciona el partido que vas a completar:
[Club A — Club B]
...
```

### 3. Tablero del partido

Esta es la pantalla hogar de la transacción.

```text
⚽ Fecha 3
Club A — Club B

RESULTADOS DEL PARTIDO · 1/4 con dato

✅ 3ª      2 — 1   OFICIAL
▫️ 2ª      — — —
🕒 Senior  1 — 1   INFORMADO
▫️ 1ª      — — —

[✅ 3ª 2-1] [✏️ 2ª]
[🕒 Senior 1-1] [✏️ 1ª]
[✅ Terminar carga del partido]
[⬅️ Fecha 3] [❌ Salir]
```

Estados humanos permitidos en el tablero:
- `OFICIAL`: dato canónico publicado/verificado.
- `INFORMADO`: aporte propio persistido y pendiente de policy/validación.
- `EN REVISIÓN`: estado canónico no verificado/disputado cuando corresponda.
- vacío: aún sin dato visible para esa serie.

No se muestran roles, IDs, nombres de tablas ni estados técnicos crudos.

### 4. Captura de una serie

Al seleccionar una serie, el MISMO mensaje cambia temporalmente:

```text
⚽ Club A — Club B
Serie: 2ª

🏠 Goles de Club A
Marcador: Club A ? — ? Club B

[0] [1] [2] [3]
[4] [5] [6] [7]
[8+]
[⬅️ Partido] [❌ Cancelar serie]
```

Después de elegir local, el mismo mensaje pide visita. `8+` mantiene contexto de partido y serie.

### 5. Confirmación de serie

```text
🧾 CONFIRMAR SERIE

Fecha 3 · 2ª
Club A 2 — 1 Club B

[✅ Guardar serie]
[✏️ Cambiar marcador]
[❌ Cancelar serie]
```

### 6. Retorno automático al partido

Guardar una serie persiste la subunidad y vuelve automáticamente al tablero del MISMO partido, mostrando el estado actualizado y un aviso humano breve.

No existe el paso `Registrar otro resultado` entre series del mismo partido.

### 7. Terminar carga del partido

`✅ Terminar carga del partido` significa terminar la sesión humana de captura, NO cambiar el estado deportivo del partido a FINAL. El usuario vuelve a la lista de partidos de la fecha. Las series ya confirmadas permanecen persistidas.

## Navegación y cancelación

- `Cancelar serie` descarta sólo la captura no confirmada de esa serie y vuelve al tablero del partido.
- Salir del partido no borra series ya confirmadas.
- Un callback vencido falla cerrado y no crea mensajes adicionales.
- Un partido fuera de scope falla cerrado.

## Concurrencia

Cada identidad Telegram mantiene su propia sesión. Dos personas pueden trabajar en partidos/series distintas al mismo tiempo. Una mutación nunca debe sobrescribir silenciosamente un resultado que cambió concurrentemente; aplica la policy de conflicto/gobierno ya existente.

## Separación de capas

```text
UX:           PARTIDO
Persistencia: SERIE
Autoridad:    POLICY / SUBMISSION
Proyección:   REPORTED / OFFICIAL
```

## Negativos obligatorios

1. Doble toque no duplica mutación.
2. Callback stale no revive sesión.
3. Scope forjado se rechaza.
4. Conflicto concurrente no sobrescribe silenciosamente.
5. Golden Path por callbacks no acumula mensajes `sendMessage`; reutiliza `editMessageText`.
6. Confirmar una serie vuelve al tablero del mismo partido.
7. Cancelar una serie conserva series previamente persistidas.
8. `INFORMADO` nunca se presenta como `OFICIAL`.

## Evidencia requerida para cerrar v2

- QA sintético determinista del Golden Path y negativos.
- Deploy del Sports Event Bus.
- Smoke de Worker/API/WebSocket sin regresión.
- Una única validación humana de la experiencia real en Telegram después del deploy. Esa validación no debe utilizarse para descubrir errores que el harness pueda detectar.
