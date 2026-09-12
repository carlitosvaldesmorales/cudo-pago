# STANDINGS-READ — contrato de presentación Telegram v2

Fecha: 2026-09-12
Estado: IMPLEMENTED_PENDING_HUMAN_APPROVAL
Canal canónico: **@FutbolChepicaBot**

## Motivo de v2

La versión anterior calculaba correctamente la clasificación, pero presentaba Campeonato Principal, grupos A/B y Campeonato Senior concatenados en un único mensaje largo. El usuario validó los datos pero rechazó esa presentación por falta de jerarquía y formato.

Por lo tanto, la aprobación previa de la visual completa queda supersedida por este contrato.

## Contrato

### Pantalla de tabla

Una pantalla representa exactamente:

- un campeonato (`PRINCIPAL` o `SENIOR`);
- un grupo (`A` o `B`);
- una tabla compacta;
- estado y advertencias resumidas;
- navegación persistente.

Ejemplo conceptual:

```text
🏆 CAMPEONATO PRINCIPAL
Grupo A
3ª + 2ª + 1ª · Máx. 9 pts por jornada

POS  CLUB                    PTS
 1.  Juventud de Chépica      16
 2.  Peñarol La Mina          14
 3.  Unión Orilla             11
 4.  Santa Elena La Ruda       9
 5.  San Juan                  4
 6.  Independiente             0

✅ Sólo resultados verificados modifican esta clasificación.
```

### Navegación

```text
[ ● Principal ] [ ○ Senior ]
[ ● Grupo A   ] [ ○ Grupo B ]
[ ⚽ Resultados ] [ 🌐 Público ]
```

Cambiar campeonato o grupo debe editar el mismo mensaje cuando Telegram lo permita.

## Invariantes visuales

- `ONE_STANDINGS_SCREEN_ONE_CHAMPIONSHIP`
- `ONE_STANDINGS_SCREEN_ONE_GROUP`
- `TELEGRAM_TABLE_USES_STRUCTURED_FORMATTING`
- `TIE_NOTICE_SUMMARIZED_ONCE`
- `INLINE_NAVIGATION_PRESERVES_CONTEXT`
- `EDIT_EXISTING_MESSAGE_BEFORE_SEND_NEW_MESSAGE`
- `RENDERER_DOES_NOT_CALCULATE_POINTS`

## Autoridad

La presentación no modifica las reglas:

- Principal = 3ª + 2ª + 1ª, máximo 9 puntos por jornada.
- Senior = campeonato independiente.
- sólo `VERIFIED` afecta la clasificación.
- diferencia de gol no desempata.

## Gate humano

Este contrato no se considera aprobado sólo por QA. Después del despliegue en @FutbolChepicaBot, el usuario debe confirmar visualmente que:

1. la jerarquía se entiende de inmediato;
2. una tabla se puede leer sin esfuerzo;
3. cambiar Grupo/Campeonato mantiene el contexto y no ensucia el chat;
4. la densidad de información es adecuada para móvil.

Hasta esa aprobación: `STANDINGS-READ.presentation_validation = PENDING`.
