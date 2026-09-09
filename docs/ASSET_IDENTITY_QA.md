# CUDO — Control de identidad de activos

## Regla raíz

**Validación técnica ≠ validación de identidad.**

Un activo no puede declararse CONFORME sólo porque tenga dimensiones, transparencia, formato o hash correctos.

## Pipeline obligatorio

FUENTE OFICIAL → IDENTIDAD → ACTIVO TÉCNICO → COMPARACIÓN VISUAL → HASH → CONFORME → REPOSITORIO

### 1. FUENTE OFICIAL
Registrar la evidencia que identifica el activo. Para escudos de clubes, priorizar material oficial aportado por el club o publicado por la organización/competencia. Si la fuente no permite demostrar un detalle, el estado es GAP; no se reconstruye ni se infiere.

### 2. IDENTIDAD
Comparar elementos identitarios antes de cualquier transformación: nombre/siglas, año, estrellas, símbolos, forma, distribución y colores visibles en la fuente.

### 3. ACTIVO TÉCNICO
Sólo después de aprobar identidad se permite adaptar técnicamente el archivo (por ejemplo: lienzo, transparencia, tamaño o compresión), sin redibujar ni reinterpretar el escudo.

### 4. COMPARACIÓN VISUAL
Comparar el activo final contra la misma fuente oficial. Una validación automática de archivo no sustituye este control.

### 5. HASH
Registrar SHA-256 del activo final aprobado para detectar sustituciones o transformaciones posteriores.

### 6. CONFORME
Sólo usar CONFORME cuando identidad + comparación visual + validación técnica estén aprobadas. Estados permitidos antes de eso: PENDIENTE_IDENTIDAD, GAP_FUENTE, PENDIENTE_VISUAL, RECHAZADO.

### 7. REPOSITORIO
Sólo activos CONFORME pueden pasar a la ruta pública/producción.

## Regla de arquitectura

Un GAP de implementación no cambia una arquitectura ya funcional salvo evidencia de que la arquitectura es la causa. El GAP se resuelve en el enlace que falla, sin introducir servicios o plataformas adicionales por defecto.

## Incidente que origina esta regla

En LOGOS-01 un PNG de Unión Orilla/CUDO fue técnicamente válido pero no correspondía íntegramente al escudo oficial: faltaban elementos identitarios. La fuente oficial aportada posteriormente por el club pasa a ser la referencia de identidad. El incidente demuestra que hash/resolución/transparencia no certifican identidad.
