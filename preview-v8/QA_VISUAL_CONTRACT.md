# CUDO V8 · Contrato de QA visual

Este documento es el gate entre **Diseño/Marketing** y **Programación**. Un cambio técnicamente correcto no se considera aprobado si incumple este contrato.

## 1. Identidad CUDO — obligatorio en todas las vistas
- Franja institucional amarillo · azul · rojo visible.
- Escudo CUDO visible y con proporción correcta; nunca pegado como elemento accidental.
- Azul profundo como base, rojo para acción/competencia y amarillo como acento.
- Titulares deportivos con `Barlow Condensed`; texto funcional con `Inter`.
- Hero/pagehead, cierre y footer deben pertenecer al mismo sistema visual.
- La página debe seguir pareciendo CUDO aunque se oculte el nombre del módulo.

## 2. Jerarquía de marketing
- Fútbol/partido/club primero; arquitectura técnica después.
- `HAZTE SOCIO` debe conservar jerarquía de CTA en desktop y móvil.
- Inicio debe priorizar: identidad → Match Center → noticias → categorías → galería → socios.
- No se permiten mensajes técnicos visibles como `Fuente pública:` ni badges QA en la vista normal.
- El aviso SEED/MOCK puede existir mientras sea preview, pero debe ser secundario y no competir con el contenido.

## 3. Navegación
- Una sola entrada `PARTIDOS` en navegación desktop y una sola en móvil.
- Una sola opción activa por vista.
- El menú móvil debe abrir/cerrar correctamente y contener `HAZTE SOCIO`.
- Ningún cambio puede volver a introducir rutas de versiones anteriores (`preview-v7`).

## 4. Responsive
Viewports mínimos certificados:
- Desktop: 1440 × 1000.
- Tablet: 1024 × 900.
- Mobile: 390 × 844.

En todos:
- Sin overflow horizontal del documento.
- Sin contenido principal cortado fuera del viewport.
- Tablas pueden usar scroll horizontal dentro de su propio contenedor.
- En móvil la navegación desktop se oculta y aparece el botón de menú.
- Cards, fotos, dorsales, titulares y CTA mantienen jerarquía legible.

## 5. Contenido de prueba representativo
Mientras producción no alimente los contratos, el seed debe permitir dimensionar el producto:
- 4 categorías.
- 84 jugadores mock: Tercera 18, Segunda 18, Senior 30, Primera 18.
- 108 partidos mock.
- 44 filas de tabla.
- 6 noticias mock.
- 15 fotografías mock de galería.

El frontend de producción debe consumir el mismo contrato; cambiar la fuente no puede exigir rediseño.

## 6. Medios
- Escudo y activos institucionales locales deben cargar siempre.
- Una imagen externa fallida no puede mostrar el icono roto del navegador: debe caer en fallback CUDO.
- Las fotografías no pueden deformarse; se usa recorte controlado (`object-fit`).

## 7. Criterio de aprobación
Un paquete solo se marca **QA VISUAL PASS** cuando:
1. pasa el validador de contratos/datos;
2. pasa el navegador automatizado en los 3 viewports;
3. no tiene errores críticos de consola;
4. genera capturas de evidencia;
5. la portada productiva raíz no fue alterada por un preview.

**Regla:** commit exitoso ≠ diseño aprobado. Deploy exitoso ≠ QA visual aprobado.
