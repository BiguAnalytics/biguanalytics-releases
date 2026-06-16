# BiguAnalytics — Product Requirements Document
**Versión:** 0.1 — Draft  
**Fecha:** Mayo 2026  
**Club:** Bigua Rugby Club, Mar del Plata, Argentina  
**Plataforma:** Electron (Windows Desktop)  
**Stack:** Electron + HTML/CSS/JS + Node.js  

---

## 1. Resumen del Producto

BiguAnalytics es una herramienta de análisis de partidos de rugby de uso interno para el cuerpo técnico de Bigua Rugby Club. Permite al analista del club tagear eventos del juego en tiempo real mientras visualiza el video del partido (MP4 local o YouTube), y luego generar dashboards interactivos y reportes exportables en PDF con los datos recolectados.

El producto reemplaza y mejora el flujo actual basado en LongoMatch + HLR (hastalaruta.com), ofreciendo una solución propia, a medida, sin costos de suscripción mensuales y con potencial de crecimiento futuro.

---

## 2. Usuarios

| Usuario | Rol | Uso principal |
|---|---|---|
| Analista del club | Usuario primario | Tagging en vivo durante el video |
| Entrenador principal (primera categoría) | Usuario secundario | Revisión de dashboards y reportes post-partido |

**Contexto de uso:**
- Una sola máquina Windows en el club
- El analista ve el video y tagea los eventos con hotkeys + panel lateral
- El entrenador revisa los resultados en la misma app o en PDF exportado

---

## 3. Problema que Resuelve

El club actualmente paga a un tercero (HLR/hastalaruta.com) para obtener informes de análisis post-partido. Este servicio usa LongoMatch como herramienta de captura y genera reportes manuales. BiguAnalytics internaliza todo este proceso, da control total al club sobre sus datos, y permite personalizar las métricas según las necesidades específicas del equipo.

---

## 4. Funcionalidades del MVP

### 4.1 Gestión de Proyectos / Partidos
- Crear un nuevo proyecto de partido (equipos, fecha, competencia, local/visitante)
- Listar partidos anteriores con sus datos básicos
- Abrir un partido existente para revisar o editar el análisis
- Eliminar un partido

### 4.2 Reproductor de Video
- Cargar video local en formato `.mp4` (lectura directa del disco, sin upload)
- Cargar video desde YouTube via URL (usando YouTube IFrame API con control total de foco)
- Controles básicos: play/pause, seek, velocidad (0.5x, 1x, 1.5x, 2x)
- Tecla de espacio para play/pause (global, sin conflicto con hotkeys de tagging)

### 4.3 Sistema de Tagging con Hotkeys

Cada hotkey activa un **panel lateral contextual** con las opciones específicas de ese evento. El video no se pausa — el panel aparece sobre el reproductor y el analista selecciona con teclas numéricas o clicks rápidos. Se puede añadir una nota de texto libre a cualquier evento.

El timestamp se registra automáticamente al momento de presionar la hotkey.

#### Eventos y Hotkeys

| Hotkey | Evento | Subclasificaciones |
|---|---|---|
| `R` | **Ruck** | Ganado / Perdido / Ganado sucio |
| `S` | **Scrum** | Ganado / Perdido / Ganado sucio + Equipo que tiene el scrum |
| `L` | **Line Out** | Ganado / Perdido / Ganado sucio + Lanzamiento: bueno / neutro / malo |
| `P` | **Penal / Free Kick** | Ataque / Defensa → tipo: Ruck / Scrum / Offside / Maul / Inconducta / Otro |
| `T` | **Try y puntos** | Try / Conversión / PK Goal / Drop / Try Penal |
| `B` | **Break Line** | Resultado: Try / Palos / Turnover / P-FK a favor / P-FK en contra / Juego |
| `K` | **Kick** | Pateador → resultado: en touch / recuperado / perdido / contestado |
| `M` | **Maul** | Ganado / Perdido / Ganado sucio |
| `V` | **Turnover** | Tipo: Knock-on / Pase forward / Mal pase / Robo en ruck / Intercepción / Touch / Otro |
| `A` | **Tarjeta** | Amarilla / Roja + equipo |
| `N` | **Nota libre** | Solo texto, sin categoría de evento |

#### Comportamiento del Panel Lateral
- Aparece instantáneamente al presionar la hotkey
- Muestra solo las opciones del evento activado (no todas las categorías juntas)
- Navegable con teclado numérico (1, 2, 3...) o mouse
- Campo de nota opcional al final del panel
- Se cierra con `Escape` o automáticamente al confirmar

### 4.4 Timeline de Eventos
- Lista scrolleable de todos los eventos taggeados del partido, ordenados por timestamp
- Muestra: tiempo del video, tipo de evento, resultado, nota (si tiene)
- Click en un evento → el video hace seek al timestamp exacto
- Editar o eliminar un evento taggeado

### 4.5 Dashboard de Análisis (post-partido)

Dashboard interactivo con los siguientes módulos, todos calculados automáticamente a partir de los tags:

**Generales**
- Score final y desglose de puntos (tries, conversiones, PKs, drops, try penales) por equipo
- Posesión % (calculada en base a eventos)
- Territorio % 
- Total de turnovers por equipo
- Total de penales por equipo
- Break lines por equipo
- Total de kicks por equipo

**Disciplina**
- Penales totales por equipo
- Penales en ataque vs. defensa
- Desglose por tipo (ruck, scrum, offside, maul, inconducta, otro)
- Tarjetas

**Set Pieces**
- Scrums: ganados / perdidos / ganados sucios (%) por equipo
- Lanzamientos desde scrum: bueno / neutro / malo
- Line Outs: ganados / perdidos / ganados sucios (%) por equipo
- Lanzamientos desde line out: bueno / neutro / malo

**Rucks**
- Total de rucks
- Rucks ganados / perdidos / ganados sucios (%) por equipo
- KPI Ruck/Posesiones

**Secuencias BIP (Ball in Play)**
- Gráfico de barras por franjas de tiempo (0-20, 20-40, 40-60, 60-80, +80)

**Break Lines y Killer Instinct**
- Break lines por origen y resultado
- Efectividad en zona de try (Killer Instinct %)

**Kicks**
- Efectividad de pateadores %
- Resultado de kicks

Todos los gráficos son interactivos (hover para ver valores exactos). El dashboard tiene una vista por equipo local y por equipo visitante, comparables side-by-side.

### 4.6 Exportación PDF
- Exportar el dashboard completo como PDF
- Formato similar al informe de HLR (referencia: informe adjunto analizado)
- Incluye logo de BiguAnalytics y datos del partido en el encabezado

### 4.7 Almacenamiento Local y servicios opcionales
- El cache local `data/{matchId}/match.json` es la fuente offline compatible por partido
- El flujo de tagging, dashboard y PDF funciona localmente sin subir videos, PDFs ni dashboards renderizados
- Cloud Sync liviano con Supabase es opcional para compartir metadata deportiva entre usuarios del club: partidos, eventos, posesiones, secuencias, notas y referencias de video
- La IA es un modulo opcional post-partido: Electron llama por IPC al main process, el main process llama a un backend propio y el backend llama al proveedor IA
- Sin internet, la app conserva el trabajo local y deja cambios pendientes de sincronizacion cuando Cloud Sync esta configurado

### 4.16 Clips por Evento: YouTube virtual y exportación MP4 local
- Desde la timeline, click derecho sobre un evento taggeado permite "Reproducir clip" si el partido usa YouTube o "Exportar clip" si tiene MP4 local.
- En el dashboard, clips aparece como un módulo propio con protagonismo, separado de los gráficos. Desde ese módulo el usuario puede abrir una pantalla dedicada "Reproducir clips" para YouTube o "Exportar clips" para MP4 local, usar filtros rápidos o filtrar por tipo de evento, resultado/subtipo, equipo y rango temporal `mm:ss`.
- La reproducción de clips YouTube ocurre en una pantalla separada del panel de Tagging para no mezclar revisión de clips con el flujo de anotación.
- Cada clip usa por defecto 3 segundos antes y 10 segundos después del timestamp del evento. Ambos valores son configurables en Ajustes con límite de 0-60s para pre-roll y 1-60s para post-roll.
- La exportación usa `ffmpeg-static` empaquetado con la app y `ffprobe-static` para duración cuando hace falta. No depende de ffmpeg instalado globalmente.
- La exportación de archivos `.mp4` funciona solo con MP4 local. Si el partido usa YouTube, la app reproduce clips virtuales dentro del YouTube IFrame API y muestra que para exportar archivos reales se debe asociar un MP4 local.
- Los clips virtuales de YouTube no generan archivos, no descargan video, no usan `youtube-dl`/`yt-dlp`, no usan scrapers y requieren conexión a internet.
- La acción "Asociar MP4 local" permite seleccionar un `.mp4` del disco para el mismo partido y habilitar la exportación real.
- Los clips se generan exclusivamente en la máquina del usuario. No se sube ningún video ni clip a la nube.
- En exportación masiva se muestra progreso, nombre del clip actual, cancelación de cola y resumen final de clips exportados/fallidos.

---

## 4.8 Heatmap de Zonas del Campo
- Al tagear cualquier evento, el panel lateral muestra opcionalmente un diagrama simplificado de la cancha de rugby dividida en zonas
- El analista hace click en la zona donde ocurrió el evento (no es obligatorio, es opcional por evento)
- En el dashboard, se muestra un heatmap superpuesto sobre el campo: zonas donde se pierden más rucks, donde se cometen penales, donde se originan los tries, etc.
- Cada tipo de evento tiene su propio heatmap filtrable
- Existe una ruta/pantalla Heatmap dedicada que reutiliza el calculo del dashboard y mantiene filtros por tipo de evento y equipo

## 4.9 Tiempo de Posesión Real
- Dos hotkeys dedicadas: `1` para posesión equipo local, `2` para posesión equipo visitante
- El sistema registra los intervalos de tiempo y calcula el % de posesión real a lo largo del partido
- Se muestra en el dashboard como línea de tiempo coloreada + porcentaje final
- Complementa (y puede reemplazar) el cálculo de posesión estimado por eventos

## 4.10 Secuencias de Juego
- Hotkey `Q` para marcar el inicio de una secuencia ofensiva o defensiva
- Hotkey `E` para marcar el fin de la secuencia + resultado (try / penal / turnover / despeje / fuera)
- El sistema registra: duración, cantidad de fases dentro de la secuencia, zona de inicio y fin, resultado
- En el dashboard: promedio de fases por secuencia, efectividad por zona de inicio, secuencias más largas

## 4.11 Modo Solo Estadísticas
- Accesible desde el menú de configuración (⚙️), no desde el flujo principal
- Permite crear un partido e ingresar los datos manualmente sin video
- Usa el mismo panel de tagging pero sin reproductor — el analista ingresa timestamps manuales o los omite
- Genera el mismo dashboard y PDF que el modo normal
- Útil para partidos sin grabación disponible

## 4.12 Notas del Entrenador
- Sección de texto libre accesible desde el dashboard del partido (ícono discreto, esquina inferior)
- El entrenador puede escribir sus conclusiones, observaciones y decisiones tácticas post-partido
- Se incluye como página final en el PDF exportado
- Soporte para formato básico (negrita, listas)

## 4.13 Alertas de Patrones
- El dashboard resalta automáticamente en **rojo** las métricas que caen por debajo de umbrales configurables
- Umbrales predefinidos razonables por defecto (ej: < 50% rucks ganados, > 15 penales, < 40% line outs ganados)
- El entrenador puede personalizar cada umbral desde configuración
- Las alertas aparecen también en el PDF con un indicador visual claro

## 4.15 Herramienta de Dibujo sobre Video

Inspirada en la funcionalidad de drawing tool de LongoMatch, pero con dos modos de uso:

### Modo 1 — Dibujo en vivo sobre el video
- Hotkey `D` para activar el modo dibujo en cualquier momento durante la reproducción
- El video se **pausa automáticamente** al activar el modo
- Se superpone un canvas transparente sobre el reproductor
- El analista dibuja encima del frame actual del video

### Modo 2 — Captura de frame + dibujo
- Desde el timeline, click derecho sobre cualquier evento → "Capturar frame y dibujar"
- Se extrae una imagen nítida del frame exacto del timestamp del evento
- Se abre el editor de dibujo sobre esa captura en alta calidad
- La imagen anotada se guarda vinculada al evento y se puede incluir en el PDF

### Herramientas de dibujo disponibles
| Herramienta | Uso |
|---|---|
| Flecha | Indicar dirección de movimiento, trayectorias de jugadores |
| Línea recta | Líneas de defensa, líneas de offside |
| Círculo / Elipse | Marcar jugadores, zonas de presión |
| Rectángulo | Delimitar zonas del campo |
| Trazo libre | Dibujo a mano alzada para movimientos fluidos |
| Texto | Añadir etiquetas o nombres encima del frame |
| Borrador | Eliminar trazos individuales |
| Deshacer / Rehacer | Ctrl+Z / Ctrl+Y |

### Paleta de colores
- Colores predefinidos rápidos: blanco, rojo, amarillo, verde, azul, negro
- Selector de color completo opcional
- Control de grosor de trazo (fino / medio / grueso)

### Gestión de dibujos
- Cada dibujo queda guardado y vinculado al timestamp o evento correspondiente
- Desde el timeline se puede ver qué eventos tienen dibujos asociados (ícono indicador)
- Los dibujos aparecen en el PDF exportado junto a los datos del evento
- Se puede configurar la **duración de visualización** del dibujo sobre el video (0.5s a 10s), para usarlos en presentaciones al plantel
- Exportar cualquier frame anotado como imagen PNG independiente

### Tablero táctico independiente
- Accesible desde el menú principal sin necesidad de tener un video abierto
- Canvas en blanco con el diagrama de la cancha de rugby de fondo
- Mismas herramientas de dibujo
- Para planificar jugadas de entrenamiento o presentaciones tácticas al plantel
- Se guarda como imagen exportable

## 4.14 Voz a Texto en Notas
- En el campo de nota de cualquier evento, botón de micrófono para dictar en vez de escribir
- Usa la Web Speech API nativa de Chromium (incluida en Electron, sin costo, sin API externa)
- Funciona en español
- El texto transcripto es editable antes de confirmar el tag

---

## 5. Funcionalidades Futuras (Roadmap Post-MVP)

Ordenadas por valor percibido:

### F1 — Clips de Video por Evento ⭐⭐⭐⭐⭐
Implementado con reproducción virtual para YouTube y exportación local MP4-only de clips separados desde timeline y dashboard (ver §4.16). El compilado único queda fuera de alcance hasta que exista una necesidad operativa concreta.

### F2 — Ir al Clip en el Video ⭐⭐⭐⭐⭐
Click en cualquier evento del dashboard o timeline → el reproductor hace seek instantáneo al timestamp. Ya previsto en el MVP (timeline), se extiende al dashboard.

### F3 — Comparación de Estadísticas entre Partidos ⭐⭐⭐⭐
No comparación lado a lado de dos partidos, sino una vista histórica: ver cómo evolucionan las métricas del equipo a lo largo de la temporada. Ej: "% rucks ganados en los últimos 5 partidos".

### F4 — Análisis con IA ⭐⭐⭐⭐
Implementado como modulo opcional con backend propio y Gemini 2.5 Flash-Lite para:
- Resumen automatico del partido en lenguaje natural
- Deteccion de patrones (ej: "el equipo pierde el 70% de los rucks en el segundo tiempo")
- Sugerencias tacticas basadas en los datos
- Texto base para el informe PDF cuando el backend IA esta configurado

Costo operativo: variable segun hosting del backend, Supabase y uso del proveedor Gemini. La app de escritorio no incluye ni expone `GEMINI_API_KEY`.

### F5 — Compartir por WhatsApp / Mail ⭐⭐⭐
Desde la app, enviar el PDF exportado directamente por WhatsApp (enlace de API) o por mail (SMTP simple) al grupo del plantel o al cuerpo técnico.

### F6 — Base de Datos de Rivales ⭐⭐⭐
Guardar análisis de equipos rivales partido a partido. Ver las tendencias del rival antes de enfrentarlo (ej: "Los Cardos pierde el 60% de sus line outs propios").

### F7 — Multi-cámara ⭐⭐
Soporte para ver dos ángulos de video sincronizados durante el tagging.

### F8 — App Mobile Companion ⭐⭐
App de iOS/Android para tagging en vivo desde el costado del campo, sincronizada con el proyecto de la app desktop.

---

## 6. Fuera de Alcance del nucleo local/offline

- Subida de videos MP4, clips, PDFs pesados o dashboards renderizados a la nube
- Analisis automatico de video con computer vision
- Backend IA embebido dentro de Electron o API keys de proveedor en renderer/main/preload
- Soporte para otros deportes
- Version web o mobile (MVP)
- Tracking de jugadores individuales (estadisticas por jugador)
- Edicion simultanea en tiempo real; Cloud Sync es liviano y con cache local

---

## 7. Métricas de Éxito

- El analista puede tagear un partido completo sin interrupciones técnicas
- El dashboard refleja correctamente todos los eventos taggeados
- El PDF exportado es presentable para el cuerpo técnico
- El flujo completo (cargar video → tagear → ver dashboard → exportar PDF) toma menos tiempo que el proceso actual con HLR

---

## 8. Restricciones Técnicas

- **Sistema operativo:** Windows únicamente (MVP)
- **Distribución:** Un solo ejecutable `.exe` instalado en una máquina
- **Costo operativo:** el nucleo local no requiere suscripcion obligatoria; Supabase, licenciamiento online, hosting del backend IA y Gemini pueden generar costo si se activan
- **Presupuesto de desarrollo:** < USD 100 para el nucleo local; APIs/hosting opcionales se presupuestan aparte
- **Tiempo de desarrollo:** 3-4 semanas, ~5 horas/día, asistido por IA (Antigravity)

---

## 9. Dependencias Técnicas Clave

| Componente | Tecnología | Motivo |
|---|---|---|
| Shell de la app | Electron | Desktop Windows, control total de hotkeys y archivos |
| Reproductor video local | HTML5 `<video>` + Node.js File API | Sin limitaciones de tamaño, sin upload |
| Reproductor YouTube | YouTube IFrame API | Control programático del video, manejo de foco |
| Gráficos del dashboard | Chart.js o Recharts | Gráficos interactivos, open source |
| Exportación PDF | Electron `BrowserWindow` + `webContents.printToPDF()` | Renderiza el dashboard como PDF de alta calidad sin navegador externo |
| Exportación de clips | ffmpeg-static + ffprobe-static | Corte local de MP4 sin recodificación por defecto; sin nube, sin descarga de YouTube |
| Storage local | JSON files + electron-store | Cache offline y compatibilidad con `data/{matchId}/match.json` |
| Cloud Sync opcional | Supabase | Sincroniza datos livianos; no sube videos, PDFs ni dashboards renderizados |
| IA opcional | Backend propio + Gemini 2.5 Flash-Lite | Mantiene `GEMINI_API_KEY` fuera de Electron y usa token de cliente revocable |
