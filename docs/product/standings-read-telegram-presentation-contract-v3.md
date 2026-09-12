# STANDINGS-READ — contrato de presentación Telegram v3

Fecha: 2026-09-12
Estado: IMPLEMENTED_PENDING_HUMAN_APPROVAL
Canal canónico: **@FutbolChepicaBot**

## Corrección de raíz

La versión v2 mejoró jerarquía y navegación, pero mantuvo dos decisiones que el usuario rechazó en runtime real:

1. obligar a navegar Grupo A / Grupo B mediante botones;
2. usar una tabla `<pre>` suficientemente ancha como para provocar desplazamiento horizontal e indicador visual extraño en Telegram iOS.

La intención pública correcta es **consultar un campeonato completo de una sola vez**.

## Contrato

### Una pantalla = un campeonato

Una pantalla representa exactamente un campeonato (`PRINCIPAL` o `SENIOR`) e incluye **ambos grupos A y B** en el mismo mensaje.

El selector de pantalla es únicamente el campeonato:

```text
[ ● Principal ] [ ○ Senior ]
[ ⚽ Resultados ] [ 🌐 Público ]
```

No existen botones Grupo A / Grupo B en esta vista pública.

### Campeonato Principal

```text
⚽ CAMPEONATO PRINCIPAL
3ª + 2ª + 1ª · Máx. 9 pts por jornada

GRUPO A
1. Juventud de Chépica — 16 pts
2. Peñarol La Mina — 14 pts
...

GRUPO B
1. Huracán — 18 pts
2. Las Cruces — 18 pts
...

✅ Sólo resultados verificados modifican esta clasificación.
⚖️ Hay posiciones empatadas pendientes de definición según el reglamento.
```

### Campeonato Senior

Misma estructura, con Grupo A y Grupo B juntos, dejando explícito que Senior es campeonato independiente.

## Formato móvil seguro

- El renderer no debe usar `<pre>` ni `<code>` para la clasificación pública.
- No debe requerir desplazamiento horizontal.
- No debe aparecer indicador lateral de overflow de Telegram.
- Los nombres de clubes se muestran como texto normal; no se recortan sólo para mantener columnas artificiales.
- La jerarquía usa HTML nativo (`<b>`, `<i>`) y saltos de línea.

## Invariantes

- `ONE_STANDINGS_SCREEN_ONE_CHAMPIONSHIP`
- `ONE_CHAMPIONSHIP_SCREEN_CONTAINS_ALL_GROUPS`
- `NO_GROUP_NAVIGATION_IN_PUBLIC_STANDINGS`
- `NO_HORIZONTAL_SCROLL_IN_TELEGRAM_STANDINGS`
- `NO_PRE_OR_CODE_FOR_PUBLIC_STANDINGS`
- `TIE_NOTICE_SUMMARIZED_ONCE_PER_SCREEN`
- `EDIT_EXISTING_MESSAGE_BEFORE_SEND_NEW_MESSAGE`
- `RENDERER_DOES_NOT_CALCULATE_POINTS`

## Autoridad

La presentación no modifica las reglas deportivas:

- Principal = 3ª + 2ª + 1ª, máximo 9 puntos por jornada.
- Senior = campeonato independiente.
- sólo `VERIFIED` afecta la clasificación.
- diferencia de gol no desempata.

## Gate humano

Después del despliegue en **@FutbolChepicaBot**, el usuario debe validar una sola cosa antes de declarar la presentación consumible:

- que la vista real en su iPhone muestra ambos grupos sin scroll horizontal, sin carácter/indicador extraño y con lectura cómoda.

Hasta esa aprobación: `STANDINGS-READ.presentation_validation = PENDING_V3`.
