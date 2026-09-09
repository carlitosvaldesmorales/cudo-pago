# CUDO — Control persistente de cambios visuales

## Propósito
Evitar el desvío detectado en LOGOS-02: una observación visual específica NO autoriza al implementador a reinterpretar el problema ni a modificar otras partes de la interfaz.

## Regla bloqueante
Toda observación visual del usuario se trata primero como un alcance literal.

Ejemplo vigente:
- Observación: «el logo de CUDO no se ve bien».
- Alcance autorizado: presentación/activo visual del escudo CUDO / Unión Orilla.
- NO autorizado: cambiar layout de Clubes, navegación, tarjetas, tipografía general, otros escudos o arquitectura.

Si durante el diagnóstico aparece otra mejora, se registra como propuesta separada y NO se implementa dentro de la corrección actual.

## Separación de roles
1. FUENTE DE VERDAD: activo oficial aprobado por el club. No redibujar ni generar con IA.
2. REVISIÓN VISUAL: agente/diseñador especializado diagnostica composición, transparencia, recorte, escala, padding y consistencia.
3. IMPLEMENTACIÓN: aplica exclusivamente la corrección diagnosticada.
4. QA TÉCNICO: identidad/hash, carga, responsive y regresión.
5. QA VISUAL: evidencia móvil/escritorio sobre producción.
6. CERTIFICACIÓN HUMANA: el usuario/club aprueba o rechaza.

El implementador NO certifica su propio trabajo visual.

## Definición de terminado
Una corrección visual NO está terminada por existir en código o en `main`.

Debe completar:
`observación → diagnóstico especializado → corrección mínima → main → Pages/cudo.cl → QA técnico → evidencia visual → aprobación humana`.

Si falta cualquier etapa: estado = ABIERTO.

## Gate de identidad
Para escudos oficiales, el hash aprobado sigue siendo bloqueante. Cambiar fondo/transparencia/recorte crea un derivado visual y requiere conservar el original como fuente y registrar explícitamente el derivado; nunca sustituir silenciosamente la fuente oficial.

## Incidente LOGOS-02 / 2026-09-09
El usuario observó específicamente que CUDO se veía mal. Se respondió cambiando el layout móvil completo. Ese commit fue un DESVÍO y se revirtió.

Diagnóstico visual pendiente de resolver de raíz: el activo mostrado de CUDO se percibe como una imagen rectangular pegada sobre la tarjeta; debe revisarse con rol visual especializado sin alterar la identidad oficial ni el resto de Clubes.

## Regla operativa para agentes
Antes de cualquier write visual, responder internamente:
- ¿Qué observó literalmente el usuario?
- ¿Qué archivo/componente representa exactamente esa observación?
- ¿Estoy tocando algo fuera de ese alcance?

Si la tercera respuesta es sí: DETENER el write y separar la propuesta.
