# CUDO — Gobernanza de agentes y certificación

Estado: REGLA OBLIGATORIA DEL PROYECTO
Fecha de adopción: 2026-09-05

## Principio no negociable

**Quien construye no certifica.**

Ningún entregable CUDO puede considerarse terminado porque el mismo agente que lo diseñó o programó diga que está correcto.

## Flujo obligatorio

1. **CUDO / Carlos — intención y aceptación de negocio**
   - Expresa el objetivo humano y las restricciones reales.
   - No tiene que diseñar requisitos técnicos ni especificar cómo programarlos.

2. **Agente especialista — requisitos y diseño**
   - Debe ser especializado en el dominio que corresponda al trabajo (UX/formularios, web, multimedia, fútbol, datos, seguridad, etc.).
   - Investiga y entrega requisitos justificables.
   - Separa evidencia, inferencia, propuesta y GAP.
   - No inventa requisitos sin fundamento.

3. **Agente implementador — materialización**
   - Programa/configura el entregable conforme al contrato del especialista.
   - No puede autocertificar su propio trabajo.

4. **Agente revisor/QA independiente — gate de rechazo**
   - Evalúa el resultado contra los requisitos y evidencia.
   - Debe buscar fallas, ambigüedades, casos límite y regresiones.
   - Tiene autoridad para declarar NO CONFORME.
   - Si rechaza, devuelve observaciones al implementador.

5. **Ciclo obligatorio**
   - Implementar → revisar → rechazar/corregir → revisar nuevamente.
   - El ciclo continúa hasta que el revisor independiente entregue CONFORME.
   - No se libera ni se presenta como terminado antes de ese gate.

6. **Certificación**
   - Debe apoyarse en evidencia objetiva y pruebas reproducibles cuando corresponda.
   - La aceptación de negocio final pertenece a CUDO/Carlos cuando sea necesaria.

## Regla sobre agentes

No se permite simular independencia usando el mismo agente con nombres o “sombreros” diferentes y presentarlo como certificación independiente.

Cuando el trabajo requiera especialización o evaluación independiente:
- buscar primero una capacidad/agente especializado real disponible;
- separar construcción de revisión;
- si no existe una capacidad suficientemente independiente, declararlo explícitamente como GAP;
- nunca reemplazar esa ausencia por una certificación ficticia.

## Aplicación inmediata — CUDO-WEB-UX-01

Esta regla se aplica ahora a la administración humana de los seis dominios visibles de la V8:
- Noticias
- Equipos / Series
- Plantel / Jugadores
- Partidos / Fechas / Resultados
- Tabla de posiciones
- Galería

Objetivo de UX: una persona que no conoce GitHub, Sheets, JSON ni Apps Script debe poder recibir la interfaz/enlace correspondiente y completar correctamente la tarea sin que Carlos tenga que explicarle por WhatsApp qué poner en cada campo.

El diseño debe cubrir como mínimo:
- propósito e instrucciones humanas;
- preguntas y ayudas comprensibles;
- campos obligatorios y validaciones;
- listas/opciones cuando eviten errores;
- eliminación de datos calculables o técnicos que no debe ingresar el usuario;
- requisitos de fotografías/multimedia justificados;
- mensajes posteriores al envío;
- compatibilidad con el contrato de datos y la V8;
- casos válidos, inválidos y límite;
- prueba E2E cuando aplique.

## Condición de salida

**NO CONFORME → no se suelta.**

**CONFORME del revisor independiente + evidencia → candidato a liberación.**

Esta regla prevalece sobre la conveniencia de avanzar rápido. El objetivo es evitar que diseño, programación y evaluación dependan de una sola mirada.