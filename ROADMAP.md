# BiguAnalytics — Roadmap de Desarrollo
**Versión:** 0.1  
**Fecha:** Mayo 2026  
**Club:** Bigua Rugby Club, Mar del Plata  
**Stack:** Electron + HTML/CSS/JS + Node.js  

> **Convención de estados:**  
> `[ ]` Pendiente · `[~]` En progreso · `[x]` Completo · `[!]` Bloqueante

---

## FASE 1 — Fundamentos y Esqueleto de la App
> *Objetivo: tener la app corriendo con navegación real, estructura de archivos y diseño aplicado. Sin esta fase no se puede construir nada más.*

### 1.1 Proyecto Electron base
- [x] 1.1.1 Inicializar proyecto con Electron + estructura de carpetas (`src/`, `styles/`, `data/`, `assets/`)
- [x] 1.1.2 Configurar `package.json`, scripts de dev y build
- [x] 1.1.3 Ventana principal: tamaño, sin frame nativo, devtools en dev
- [x] 1.1.4 Configurar `electron-store` para persistencia de settings globales
- [x] 1.1.5 Configurar sistema de rutas / vistas (SPA interna con router simple o multi-BrowserView)

### 1.2 Design System aplicado
- [x] 1.2.1 Crear `tokens.css` con todas las variables de color, tipografía y espaciado (DESIGN.md §1–3)
- [x] 1.2.2 Crear `base.css`: reset, body, fondo con gradiente de ambiente, glows de neblina
- [x] 1.2.3 Crear `layout.css`: sidebar, topbar, grid principal
- [x] 1.2.4 Aplicar fuentes (`Arial Black` / `Arial`) en todos los elementos
- [x] 1.2.5 Implementar componente Sidebar (colapsado 56px / expandido 220px, íconos, navegación activa)
- [x] 1.2.6 Implementar Topbar (logo BiguAnalytics, info partido, acciones)
- [x] 1.2.7 Implementar micro-interacciones base: hover sidebar, transición entre pantallas (fade 150ms)

### 1.3 Sistema de datos local
- [x] 1.3.1 Definir schema JSON de un partido (`match.json`: id, equipos, fecha, competencia, eventos, secuencias, posesión)
- [x] 1.3.2 Módulo `storage.js`: crear, leer, actualizar y eliminar partidos
- [x] 1.3.3 Módulo `events.js`: agregar, editar y eliminar eventos dentro de un partido
- [x] 1.3.4 Carpeta de datos por partido: `data/{matchId}/match.json`
- [x] 1.3.5 Módulo `settings.js`: leer/escribir configuración global (umbrales, preferencias)

### 1.4 Pantalla Home
- [x] 1.4.1 Layout Home: sidebar expandido, header de bienvenida, grid de partidos
- [x] 1.4.2 Match cards: diseño con thumbnail, equipos, resultado, badges (victoria/derrota, analizado/sin analizar)
- [x] 1.4.3 Card "Nuevo partido": botón dashed, abre modal de creación
- [x] 1.4.4 Modal "Nuevo partido": campos equipo local, equipo visitante, fecha, competencia, local/visitante
- [x] 1.4.5 KPIs de temporada (4 cards): datos de todos los partidos de la temporada en curso
- [x] 1.4.6 Acción eliminar partido (con confirmación)
- [x] 1.4.7 Acción abrir partido existente (navega a Tagging o Dashboard según estado)

> **Auditoría Fase 1 — 2026-05-26:** los faltantes detectados quedaron cerrados. `assets/` y `data/` existen como carpetas formales del esqueleto; settings usa `electron-store`; Topbar tiene acciones reales hacia secciones placeholder; abrir un partido navega a Tagging o Dashboard según estado, usando páginas "en construcción" para módulos de fases posteriores.

---

## FASE 2 — Reproductor y Sistema de Tagging
> *Objetivo: el analista puede cargar un video y tagear todos los eventos del partido de forma fluida con hotkeys. Es el corazón de la app.*

### 2.1 Reproductor de video local (MP4)
- [x] 2.1.1 Layout Tagging: sidebar colapsado, topbar, área de video, controles, timeline, hotkey bar
- [x] 2.1.2 Integrar `<video>` HTML5 con carga de archivo MP4 via Node.js File API (sin límite de tamaño)
- [x] 2.1.3 Controles del reproductor: play/pause, seek (scrubber), tiempo actual / duración
- [x] 2.1.4 Control de velocidad: 0.5x, 1x, 1.5x, 2x
- [x] 2.1.5 Botones de salto: −10s / +10s
- [x] 2.1.6 Barra de progreso clickeable con preview de tiempo al hover
- [x] 2.1.7 Hotkey global Espacio → play/pause (sin conflicto con tagging)
- [x] 2.1.8 Hotkey global `←` / `→` → retroceder/avanzar 5s
- [x] 2.1.9 Indicador de timestamp actual siempre visible

### 2.2 Reproductor YouTube
- [x] 2.2.1 Input de URL de YouTube en el modal de nuevo partido (o en pantalla de tagging)
- [x] 2.2.2 Integrar YouTube IFrame API dentro de Electron con iframe oficial seguro (sin webview/BrowserView)
- [x] 2.2.3 Controles de play/pause, seek y velocidad via API de YouTube (control total de foco)
- [x] 2.2.4 Sincronizar timestamp de YouTube con el sistema de tagging
- [x] 2.2.5 Manejo de foco: hotkeys de tagging no deben activarse dentro del iframe de YouTube

### 2.3 Sistema de Tagging — Motor central
- [x] 2.3.1 Listener global de hotkeys (funcional incluso con el video en foco)
- [x] 2.3.2 Al presionar hotkey: capturar timestamp exacto del video + disparar popup del evento
- [x] 2.3.3 Módulo `tagger.js`: mapa de hotkeys → eventos, manejo de estado del popup activo
- [x] 2.3.4 Bloqueo de hotkeys de otros eventos mientras un popup está abierto
- [x] 2.3.5 Hotkey `Escape`: cierra popup sin guardar
- [x] 2.3.6 El video NO se pausa al abrir el popup (comportamiento por defecto)

### 2.4 Popup de Tagging
- [x] 2.4.1 Componente popup flotante: posicionamiento inteligente (derecha del video si hay espacio, centrado si no)
- [x] 2.4.2 Animación apertura: scale(0.96→1) + fadeIn 120ms; cierre: scale(1→0.96) + fadeOut 80ms
- [x] 2.4.3 Header del popup: nombre del evento + hotkey activada
- [x] 2.4.4 Botones de opciones navegables con teclado numérico (1, 2, 3...) y mouse
- [x] 2.4.5 Campo de nota de texto libre (opcional, al final del popup)
- [x] 2.4.6 Botón micrófono en campo de nota → activar Web Speech API (dictado en español)
- [x] 2.4.7 Botón "Confirmar" (Enter) → guarda el evento y cierra el popup
- [x] 2.4.8 Auto-cierre si no se interactúa en 8 segundos (configurable)
- [x] 2.4.9 Hotkey bar inferior: muestra hints de hotkeys disponibles, colapsable

### 2.5 Eventos específicos — Popups por tipo
> *Cada evento tiene sus propias opciones. Implementar uno por uno.*

- [x] 2.5.1 **R — Ruck:** opciones Ganado / Perdido / Ganado sucio
- [x] 2.5.2 **S — Scrum:** Ganado / Perdido / Ganado sucio + selector de equipo con el scrum
- [x] 2.5.3 **L — Line Out:** Ganado / Perdido / Ganado sucio + lanzamiento Bueno / Neutro / Malo
- [x] 2.5.4 **P — Penal / Free Kick:** primero Ataque / Defensa → luego tipo (Ruck / Scrum / Offside / Maul / Inconducta / Otro)
- [x] 2.5.5 **T — Try y puntos:** Try / Conversión / PK Goal / Drop / Try Penal
- [x] 2.5.6 **B — Break Line:** resultado (Try / Palos / Turnover / P-FK a favor / P-FK en contra / Juego)
- [x] 2.5.7 **K — Kick:** selector de pateador + resultado (En touch / Recuperado / Perdido / Contestado)
- [x] 2.5.8 **M — Maul:** Ganado / Perdido / Ganado sucio
- [x] 2.5.9 **V — Turnover:** tipo (Knock-on / Pase forward / Mal pase / Robo en ruck / Intercepción / Touch / Otro)
- [x] 2.5.10 **A — Tarjeta:** Amarilla / Roja + selector de equipo
- [x] 2.5.11 **N — Nota libre:** solo campo de texto, sin categoría de evento

### 2.6 Posesión y Secuencias
- [x] 2.6.1 **Hotkeys 1 / 2:** iniciar posesión equipo local / visitante — registrar intervalo de tiempo
- [x] 2.6.2 Cálculo automático de % de posesión real por intervalos
- [x] 2.6.3 **Hotkey Q:** marcar inicio de secuencia ofensiva o defensiva
- [x] 2.6.4 **Hotkey E:** marcar fin de secuencia + popup de resultado (Try / Penal / Turnover / Despeje / Fuera)
- [x] 2.6.5 Registrar duración de secuencia, cantidad de fases dentro de ella, zona de inicio y fin

### 2.7 Heatmap — Captura de zona en tagging
- [x] 2.7.1 Diagrama simplificado del campo de rugby dividido en zonas (grilla clickeable)
- [x] 2.7.2 El campo de zonas aparece como sección opcional dentro del popup de tag (no obligatorio)
- [x] 2.7.3 Guardar zona seleccionada junto al evento
- [x] 2.7.4 Navegación del campo con teclado (para no soltar el mouse del video)

### 2.8 Timeline estilo editor de video
- [x] 2.8.1 Área de timeline de 140px debajo de los controles
- [x] 2.8.2 Eje de tiempo horizontal con marcas cada 5 minutos (0' a 80'+)
- [x] 2.8.3 Tracks verticales por tipo de evento: Rucks, Scrums, Line Outs, Penales, Tries/Pts, Notas
- [x] 2.8.4 Bloques de color por resultado (verde=ganado, rojo=perdido, ámbar=sucio, azul=ataque, etc.)
- [x] 2.8.5 Click en bloque → seek instantáneo al timestamp del evento en el video
- [x] 2.8.6 Hover en bloque → tooltip con detalle del evento (tipo, resultado, nota)
- [x] 2.8.7 Preview del evento seleccionado: mini-card encima de la timeline con timestamp, tipo, nota
- [x] 2.8.8 Área de click mínima de 20px por bloque aunque el evento sea corto
- [x] 2.8.9 Scroll horizontal en la timeline para partidos largos
- [x] 2.8.10 Playhead: línea vertical que avanza con el tiempo del video

### 2.9 Modo Solo Estadísticas
- [x] 2.9.1 Opción en Ajustes (⚙️) para crear partido sin video
- [x] 2.9.2 Mismo panel de tagging pero sin reproductor — campo de timestamp manual (o dejar vacío)
- [x] 2.9.3 Timestamps omitidos no rompen la timeline ni el dashboard

> **Auditoría Fase 2 — 2026-05-26:** la vista Tagging quedó operativa con reproductor MP4 local, fuente YouTube en `webview`, controles sincronizados, motor `tagger.js`, 11 popups de eventos, posesión, secuencias, zonas de campo, hotkey bar, timeline y modo solo estadísticas. Cobertura automatizada agregada para media, storage/eventos y motor de tagging.

---

## FASE 3 — Dashboard y Exportación
> *Objetivo: los datos recolectados se vuelven información útil. El entrenador puede ver el análisis y exportarlo.*

### 3.1 Motor de cálculo de métricas
- [x] 3.1.1 Módulo `analytics.js`: funciones de agregación sobre el JSON del partido
- [x] 3.1.2 Cálculo de score final (tries, conversiones, PK goals, drops, tries penales) por equipo
- [x] 3.1.3 Posesión % (real por intervalos + estimada por eventos)
- [x] 3.1.4 Territorio % (basado en zonas de heatmap si están disponibles)
- [x] 3.1.5 Totales: turnovers, penales, break lines, kicks por equipo
- [x] 3.1.6 Métricas de Set Pieces: % ganados / perdidos / sucios por tipo (scrums, line outs)
- [x] 3.1.7 Métricas de Rucks: totales, % por resultado, KPI ruck/posesiones
- [x] 3.1.8 Métricas de Kicks: efectividad por pateador, resultado de kicks
- [x] 3.1.9 Métricas de Disciplina: penales por tipo, ataque/defensa, tarjetas
- [x] 3.1.10 Métricas de Break Lines: por origen y resultado, Killer Instinct %
- [x] 3.1.11 Secuencias BIP por franja de tiempo (0-20, 20-40, 40-60, 60-80, +80)
- [x] 3.1.12 Promedio de fases por secuencia, efectividad por resultado y secuencias más largas
- [x] 3.1.13 Alertas automáticas: comparar métricas vs. umbrales configurados → flag rojo

### 3.2 Pantalla Dashboard — Layout y navegación
- [x] 3.2.1 Layout Dashboard: sidebar colapsado, topbar con acciones, header del partido
- [x] 3.2.2 Header del partido: score prominente, equipos, fecha, competencia
- [x] 3.2.3 KPI row: 4 KPIs principales configurables
- [x] 3.2.4 Toggle: vista Bigua / vista rival / vista comparada side-by-side
- [x] 3.2.5 Secciones colapsables por categoría (Set Pieces, Rucks, Kicks, Disciplina, etc.)
- [x] 3.2.6 Botón "Exportar PDF" sticky en topbar

### 3.3 Gráficos interactivos (Chart.js)
- [x] 3.3.1 Configurar Chart.js con el design system (colores, fuentes, fondos)
- [x] 3.3.2 Gráfico de posesión: línea de tiempo bicolor + porcentaje final
- [x] 3.3.3 Gráfico de Set Pieces: barras agrupadas (ganados/perdidos/sucios) por equipo
- [x] 3.3.4 Gráfico de Rucks: donut o barra horizontal con totales y %
- [x] 3.3.5 Gráfico de Penales: barras por tipo con desglose ataque/defensa
- [x] 3.3.6 Gráfico de Break Lines: origen × resultado (stacked bar o mapa de calor simple)
- [x] 3.3.7 Gráfico BIP por franjas: barras por tiempo (0-20, 20-40, etc.)
- [x] 3.3.8 Gráfico de Kicks: efectividad por pateador (barras horizontales)
- [x] 3.3.9 Hover en todos los gráficos: tooltip con valores exactos
- [x] 3.3.10 Alertas visuales: KPI cards con glow rojo pulsante si la métrica cae bajo umbral

### 3.4 Heatmap en Dashboard
- [x] 3.4.1 Campo de rugby vectorial con zonas del tagging
- [x] 3.4.2 Gradiente de intensidad rojo sobre zonas: más eventos = más rojo
- [x] 3.4.3 Chips de filtro horizontal: filtrar por tipo de evento (penales, rucks perdidos, tries, etc.)
- [x] 3.4.4 Heatmap separado por equipo si se filtra por equipo

### 3.5 Notas del Entrenador
- [x] 3.5.1 Botón discreto (ícono, esquina inferior) abre panel de notas en el dashboard
- [x] 3.5.2 Editor de texto libre con formato básico (negrita, listas)
- [x] 3.5.3 Guardado automático en el JSON del partido

### 3.6 Alertas de Patrones — Configuración
- [x] 3.6.1 Pantalla de Ajustes: sección de umbrales de alerta
- [x] 3.6.2 Umbrales predefinidos razonables (< 50% rucks, > 15 penales, < 40% line outs, etc.)
- [x] 3.6.3 El entrenador puede editar cada umbral con input numérico
- [x] 3.6.4 Guardar umbrales en configuración global (`electron-store`)

### 3.7 Exportación PDF
- [x] 3.7.1 Configurar Puppeteer (headless Chromium) dentro de Electron
- [x] 3.7.2 Renderizar una vista especial del dashboard optimizada para PDF (sin interactividad)
- [x] 3.7.3 Encabezado PDF: logo BiguAnalytics, nombre de equipos, fecha, competencia
- [x] 3.7.4 Página 1: KPIs generales + score
- [x] 3.7.5 Páginas de secciones: Set Pieces, Rucks, Kicks, Penales, Break Lines, BIP
- [x] 3.7.6 Página de Heatmap (si hay datos de zona)
- [x] 3.7.7 Página final: Notas del Entrenador
- [x] 3.7.8 Alertas con indicador visual claro en PDF (color rojo, ícono)
- [x] 3.7.9 Diálogo nativo de "Guardar como..." para elegir destino del PDF
- [ ] 3.7.10 Validar que el PDF tenga el mismo aspecto en distintas versiones de Windows

> **Auditoria Fase 3 - 2026-05-28:** motor `analytics.js`, dashboard, graficos Chart.js, heatmap, notas, umbrales editables, IPC y exportacion PDF quedaron implementados. Verificacion automatizada: `npm test` completo en verde. Pendiente: validacion visual del PDF en distintas versiones de Windows.

---

## FASE 3.8 / FASE LICENCIAMIENTO — Auth, whitelist, licencias y dispositivos
> *Objetivo: agregar control de acceso online sin subir datos deportivos ni modificar el almacenamiento local.*

- [x] 3.8.1 Login por email OTP de Supabase con `shouldCreateUser: false`
- [x] 3.8.2 Whitelist por `profiles.status = approved`
- [x] 3.8.3 Licencia por club con estados `trial`, `active`, `suspended`, `expired` y vencimiento
- [x] 3.8.4 Registro de dispositivos por fingerprint SHA-256 generado en main process
- [x] 3.8.5 Dispositivos nuevos creados como `pending` y aprobacion manual desde Supabase
- [x] 3.8.6 Sesion Supabase guardada por IPC con `safeStorage` y fallback documentado
- [x] 3.8.7 Guard global para Home, Tagging, Dashboard, Settings, Season, Tactical Board, IA y Export PDF
- [x] 3.8.8 Badge discreto de licencia activa en topbar
- [x] 3.8.9 Watermark de licencia en PDFs exportados
- [x] 3.8.10 Migracion Supabase con RLS, politicas de solo lectura propia, device pending propio y RPC segura para `last_seen_at`

> **Auditoria Fase 3.8 - 2026-05-29:** licenciamiento online implementado sin tocar `data/{matchId}/match.json` ni subir informacion deportiva a Supabase. Verificacion automatizada: `npm test` completo en verde.

---

## FASE 4 — Herramientas Avanzadas
> *Objetivo: agregar las herramientas de dibujo, tablero táctico y edición de eventos. La app queda completa.*

### 4.1 Timeline — Edición de eventos
- [x] 4.1.1 Click derecho en bloque de timeline → menú contextual (Editar / Eliminar / Capturar frame)
- [x] 4.1.2 Modal de edición: modificar resultado, nota, zona del evento
- [x] 4.1.3 Eliminar evento con confirmación
- [x] 4.1.4 Indicador visual en bloques que tienen nota o dibujo asociado

### 4.2 Herramienta de Dibujo — Modo en vivo
- [x] 4.2.1 Hotkey `D` → activar modo dibujo: video se pausa, canvas transparente se superpone
- [x] 4.2.2 Toolbar flotante en esquina inferior izquierda del video: herramientas de dibujo
- [x] 4.2.3 Herramienta flecha (dirección de movimiento)
- [x] 4.2.4 Herramienta línea recta
- [x] 4.2.5 Herramienta círculo / elipse
- [x] 4.2.6 Herramienta rectángulo
- [x] 4.2.7 Herramienta trazo libre (freehand)
- [x] 4.2.8 Herramienta texto
- [x] 4.2.9 Borrador (eliminar trazos individuales)
- [x] 4.2.10 Deshacer / Rehacer (Ctrl+Z / Ctrl+Y)
- [x] 4.2.11 Paleta de colores rápidos (blanco, rojo, amarillo, verde, azul, negro)
- [x] 4.2.12 Selector de color completo (color picker)
- [x] 4.2.13 Control de grosor de trazo (fino / medio / grueso)

### 4.3 Herramienta de Dibujo — Captura de frame
- [x] 4.3.1 Click derecho en evento del timeline → "Capturar frame y dibujar"
- [x] 4.3.2 Extraer imagen nítida del frame exacto del timestamp del evento (via canvas snapshot del video)
- [x] 4.3.3 Abrir el editor de dibujo sobre la captura en alta calidad
- [x] 4.3.4 Guardar imagen anotada vinculada al evento en el JSON del partido
- [x] 4.3.5 Exportar frame anotado como PNG independiente
- [x] 4.3.6 Configurar duración de visualización del dibujo sobre el video (0.5s a 10s)

### 4.4 Tablero Táctico independiente
- [x] 4.4.1 Pantalla accesible desde sidebar (ícono dibujo) sin video activo
- [x] 4.4.2 Canvas en blanco con diagrama del campo de rugby de fondo
- [x] 4.4.3 Mismas herramientas de dibujo que el modo en vivo
- [x] 4.4.4 Guardar tablero como imagen exportable (PNG)
- [x] 4.4.5 Múltiples tableros guardados (biblioteca de jugadas)

### 4.5 Integración de dibujos en el PDF
- [x] 4.5.1 Incluir imágenes anotadas (frames capturados) en la sección correspondiente del PDF
- [x] 4.5.2 Indicador en la timeline de eventos con dibujos asociados

### 4.6 Pantalla Temporada
- [x] 4.6.1 Vista de todos los partidos de la temporada en tabla
- [x] 4.6.2 Evolución de métricas clave a lo largo de la temporada (gráfico de línea)
- [x] 4.6.3 Promedios generales de la temporada (% rucks, penales promedio, % line outs, etc.)
- [x] 4.6.4 Filtro por competencia

> **Auditoria Fase 4 - 2026-05-29:** edicion/eliminacion de eventos desde timeline, dibujo en vivo, captura de frames, tablero tactico, integracion de frames en PDF y pantalla Temporada quedaron implementados sobre Electron + renderer vanilla. Verificacion automatizada: `npm test` completo en verde.

---

## FASE 5 — Pulido, Empaquetado y Entrega
> *Objetivo: la app está lista para instalarse en la máquina del club y usarse en producción.*

### 5.1 Pulido UX
- [x] 5.1.1 Revisar todos los micro-estados: loading, empty states, errores de archivo no encontrado
- [x] 5.1.2 Primer uso: onboarding mínimo (tooltip de hotkeys en el primer partido)
- [x] 5.1.3 Validaciones en todos los formularios (campos vacíos, URLs de YouTube inválidas)
- [x] 5.1.4 Confirmar que ningún hotkey de tagging interfiere con atajos del sistema Windows

### 5.2 Rendimiento
- [ ] 5.2.1 Probar con videos MP4 de más de 2 horas — no debe haber lag en la timeline
- [x] 5.2.2 Verificar que el JSON del partido no crece de forma incontrolable
- [x] 5.2.3 Lazy loading de gráficos del dashboard (no renderizar todo de una)

### 5.3 Empaquetado
- [x] 5.3.1 Configurar `electron-builder` para generar `.exe` instalable en Windows
- [x] 5.3.2 Icono de la app (usar isotipo BiguAnalytics)
- [x] 5.3.3 Nombre del ejecutable y carpeta de instalación
- [x] 5.3.4 Incluir todas las dependencias nativas (Puppeteer, etc.) en el bundle
- [ ] 5.3.5 Probar instalación en una máquina Windows limpia
- [x] 5.3.6 Carpeta de datos del usuario en `AppData` (no en `Program Files`)

### 5.4 Testing final
- [x] 5.4.1 Flujo completo: crear partido → cargar video → tagear 80 minutos → ver dashboard → exportar PDF
- [x] 5.4.2 Flujo YouTube: cargar URL → tagear → verificar timestamps correctos
- [x] 5.4.3 Flujo Modo Solo Estadísticas: partido sin video → dashboard → PDF
- [x] 5.4.4 Edición y eliminación de eventos
- [x] 5.4.5 Todas las hotkeys responden sin conflictos
- [x] 5.4.6 PDF generado es presentable y todos los gráficos se renderizan correctamente    

> **Auditoria Fase 5 - 2026-05-30:** pulido de estados vacios/loading/errores IPC, onboarding firstLaunch, validaciones inline, hotkeys acotadas a Tagging, lazy render de Chart.js con IntersectionObserver, PDF con render forzado de graficos, `puppeteer-core` sobre Chromium de Electron y build NSIS `BiguAnalytics-Setup-1.0.0.exe` quedaron implementados. Verificacion automatizada: `npm test` completo en verde (45 archivos, 295 tests), `npm run build` en verde, icono 16/24/32/48/64/128/256px verificado, arranque unpacked en 669 ms y datos en `%APPDATA%\BiguAnalytics`. Pendiente externo: prueba en una maquina Windows limpia con instalacion real del club.
    
--- 
    
## ROADMAP POST-MVP (Funcionalidades Futuras)
> *Referencia directa al §5 del PRD. No incluir en el desarrollo inicial.*

- [ ] **F1 — Clips de Video por Evento:** exportar compilado de clips via `ffmpeg` ⭐⭐⭐⭐⭐
- [ ] **F2 — Seek desde Dashboard:** click en evento del dashboard → seek en reproductor ⭐⭐⭐⭐⭐
- [ ] **F3 — Comparación histórica:** evolución de métricas a lo largo de la temporada ⭐⭐⭐⭐
- [x] **F4 — Análisis con IA:** resumen automático + detección de patrones via Gemini API ⭐⭐⭐⭐
- [ ] **F5 — Compartir por WhatsApp / Mail:** envío directo del PDF ⭐⭐⭐
- [ ] **F6 — Base de Datos de Rivales:** historial por equipo rival ⭐⭐⭐
- [ ] **F7 — Multi-cámara:** dos ángulos sincronizados ⭐⭐
- [ ] **F8 — App Mobile Companion:** tagging desde el costado del campo ⭐⭐

---

## Notas para el agente de código

- El orden de las fases es secuencial y debe respetarse: cada fase depende de la anterior.
- Dentro de cada subfase, los ítems pueden paralelizarse si el agente puede mantener coherencia.
- Cada ítem completado debe marcarse `[x]`. Si un ítem queda bloqueado, marcarlo `[!]` con una nota de por qué.
- El design system (`DESIGN.md`) es la fuente de verdad para todos los aspectos visuales. Ante cualquier duda de estilo, consultar ese documento primero.
- El PRD (`PRD.md`) es la fuente de verdad para el comportamiento funcional.
- No inventar soluciones de UI que no estén en `DESIGN.md` — si algo no está cubierto, seguir el principio del §0: mínima UI, máxima coherencia con el resto.
