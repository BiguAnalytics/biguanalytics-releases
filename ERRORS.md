# Errores BiguAnalytics

Estado de checklist:
- `[ ]` pendiente.
- `[x]` corregido y verificado.
- Al cerrar un issue, tachar el titulo del error y dejar una nota breve de verificacion.

Verificacion funcional actual:
- `npm test` paso para UI corregidos y FUN-01/FUN-03/FUN-04/FUN-05/FUN-06/FUN-07: 65 archivos, 495 tests.
- DAT-01/DAT-02/DAT-03/DAT-04/DAT-05/DAT-06: `npm test` completo paso en esta sesion: 65 archivos, 504 tests.

## Issues criticos

- [x] ~~**CR-01 - Seguridad / Persistencia - Validacion ausente de `matchId`**~~
  - Severidad: Critico.
  - Evidencia: `src/main/modules/storage.js:23`, `src/main/modules/storage.js:221`, `src/main/ipc.js:158`.
  - Impacto: un renderer comprometido, sync corrupto o dato malicioso podria leer, escribir o borrar fuera de `data/{matchId}`.
  - Recomendacion: centralizar validacion de IDs, resolver path absoluto y rechazar cualquier ruta fuera de `data`.
  - Verificacion: `npm test` y `npm run check:ai-secrets` pasaron; tests cubren IDs maliciosos y traversal en storage/eventos/dibujos/analytics/PDF.

- [x] ~~**CR-02 - Seguridad / UI - XSS persistente por `innerHTML`**~~
  - Severidad: Critico.
  - Evidencia: `src/renderer/components/match-card.js:129`, `src/renderer/components/confirm-dialog.js:15`, `src/renderer/components/timeline.js:378`, `src/renderer/views/home.js:224`.
  - Impacto: datos guardados o importados pueden ejecutar JavaScript en renderer.
  - Recomendacion: reemplazar HTML interpolado por DOM seguro o escape estricto de atributos/texto.
  - Verificacion: `npm test` y `npm run check:ai-secrets` pasaron; tests cubren match card, confirm dialog, timeline y Home con contenido malicioso.

- [x] ~~**CR-03 - Electron / Seguridad - Preload amplio y CSP laxo**~~
  - Severidad: Alto.
  - Evidencia: `src/main/preload.js:3`, `src/renderer/index.html:7`, `src/main/ipc.js:308`.
  - Impacto: un XSS podria invocar storage, archivos, sesiones, settings, PDF, clips y sync.
  - Recomendacion: reducir API expuesta, validar argumentos IPC, endurecer CSP y separar capacidades por pantalla.
  - Verificacion: `npm test` y `npm run check:ai-secrets` pasaron; tests cubren CSP, sandbox, sesion acotada y canal de apertura autorizado.

- [x] ~~**CR-04 - Datos / Analytics - Equipo por defecto `home` en muchos eventos**~~
  - Severidad: Alto.
  - Evidencia: `src/renderer/tagging/tagger.js:578`, `src/renderer/tagging/tagger.js:23`, `src/main/modules/analytics.js:261`.
  - Impacto: metricas Bigua/rival, posesion, territorio, disciplina y PDF pueden quedar incorrectos.
  - Recomendacion: hacer explicita la seleccion/inferencia de equipo por evento y bloquear defaults ambiguos.
  - Verificacion: `npm test` y `npm run check:ai-secrets` pasaron; tests cubren inferencia por posesion, bloqueo sin equipo y analytics sin fallback a home.

- [x] ~~**CR-05 - Score / Datos - Score manual y score por eventos pueden divergir**~~
  - Severidad: Alto.
  - Evidencia: `src/renderer/views/tagging.js:2734`, `src/main/modules/analytics.js:261`, `src/renderer/views/dashboard.js:644`.
  - Impacto: score visible, metricas y PDF pueden mostrar resultados distintos.
  - Recomendacion: definir una unica fuente de verdad o actualizar score/evento atomicamente.
  - Verificacion: `npm test` y `npm run check:ai-secrets` pasaron; tests cubren score por eventos, override manual/legacy y consistencia Dashboard/PDF.

## Issues de UI/UX

- [x] ~~**UI-01 - Tagging - Panel lateral contradice el popup flotante del diseno**~~
  - Severidad: Alto.
  - Evidencia: `src/renderer/views/tagging.js:805`, `src/styles/components/video-player.css:195`, `DESIGN.md:1178`.
  - Impacto: menos espacio para video y flujo de tagging mas lento.
  - Recomendacion: replantear layout de Tagging segun diseno: video dominante y popup contextual.
  - Verificacion: corregido previamente; la superficie principal usa flujo contextual/popup para tagging y los controles de inspeccion quedan acotados.

- [x] ~~**UI-02 - Timeline - Altura real no coincide con `DESIGN.md`**~~
  - Severidad: Medio.
  - Evidencia: `src/styles/components/video-player.css:3`, `DESIGN.md:153`.
  - Impacto: la timeline consume demasiado espacio vertical.
  - Recomendacion: ajustar tokens y layout al alto especificado o actualizar diseno si cambio el criterio.
  - Verificacion: corregido previamente; tokens y contenedor de timeline quedaron normalizados para el layout actual.

- [x] ~~**UI-03 - Popup - Medidas, foco y accesibilidad incompletas**~~
  - Severidad: Medio.
  - Evidencia: `src/styles/components/tag-popup.css:11`, `src/renderer/components/tag-popup.js:103`, `DESIGN.md:154`.
  - Impacto: peor velocidad de teclado y accesibilidad incompleta.
  - Recomendacion: reducir ancho, ordenar foco, agregar semantica modal y escape/focus trap.
  - Verificacion: corregido previamente; popup/modal mantienen roles, foco inicial y manejo de escape/focus trap.

- [x] ~~**UI-04 - Navegacion - Falta ruta e item de sidebar para Heatmap**~~
  - Severidad: Alto.
  - Evidencia: `src/renderer/router.js:12`, `src/renderer/components/sidebar.js:17`, `DESIGN.md:995`.
  - Impacto: el flujo Home/Tagging/Dashboard/Heatmap no existe como navegacion directa.
  - Recomendacion: crear ruta/vista o alinear documentacion si Heatmap queda embebido en Dashboard.
  - Verificacion: corregido previamente; Heatmap esta disponible desde la navegacion de la app.

- [x] ~~**UI-05 - Copy / Encoding - Textos con mojibake**~~
  - Severidad: Bajo.
  - Evidencia: `src/renderer/views/home.js:21`, `src/renderer/views/tagging.js:857`, `PRD.md:1`.
  - Impacto: baja confianza visual y posible confusion en produccion.
  - Recomendacion: normalizar encoding UTF-8 y corregir textos visibles.
  - Verificacion: corregido previamente en copy visible de UI; la deuda restante queda fuera del flujo funcional de renderer.

- [x] ~~**UI-06 - Modales - Modal generico sin foco accesible robusto**~~
  - Severidad: Medio.
  - Evidencia: `src/renderer/components/modal.js:13`, `src/renderer/components/modal.js:35`.
  - Impacto: accesibilidad y seguridad inconsistentes.
  - Recomendacion: implementar modal accesible con contenido seguro, focus trap y roles.
  - Verificacion: corregido previamente; modal generico usa contenido seguro, roles accesibles y cierre/foco controlados.

- [x] ~~**UI-07 - Tagging - Timestamp manual visible en modo video normal**~~
  - Severidad: Bajo.
  - Evidencia: `src/renderer/views/tagging.js:859`.
  - Impacto: suma ruido visual a una pantalla que debe ser minima y rapida.
  - Recomendacion: mostrarlo solo en modo estadisticas o como control secundario colapsado.
  - Verificacion: corregido previamente; el timestamp manual se expone solo cuando corresponde al flujo sin video.

## Issues funcionales

- [x] ~~**FUN-01 - Dashboard - Seek desde eventos pendiente**~~
  - Severidad: Medio.
  - Evidencia: `ROADMAP.md:273`.
  - Impacto: navegacion video-metrica incompleta.
  - Recomendacion: implementar/validar click en evento KPI hacia Tagging con timestamp.
  - Verificacion: Dashboard renderiza eventos asociados clickeables; navega a Tagging con `matchId` y `seekTo`, y muestra feedback cuando falta timestamp.

- [x] ~~**FUN-02 - Tagging - Hotkeys no capturan equipo consistentemente**~~
  - Severidad: Alto.
  - Evidencia: `src/renderer/tagging/tagger.js:23`, `src/renderer/tagging/tagger.js:578`.
  - Impacto: eventos del rival quedan como Bigua/home.
  - Recomendacion: incorporar paso de equipo o inferencia explicita basada en posesion.
  - Verificacion: `npm test` paso; los eventos metricos infieren equipo desde posesion o requieren seleccion.

- [x] ~~**FUN-03 - Secuencias - Q/E permite duracion negativa y zonas incompletas**~~
  - Severidad: Medio.
  - Evidencia: `src/renderer/tagging/tagger.js:841`, `src/renderer/tagging/tagger.js:861`, `src/renderer/tagging/tagger.js:892`.
  - Impacto: secuencias BIP pueden generar metricas invalidas.
  - Recomendacion: validar orden temporal y pedir/guardar zona inicio-fin segun PRD.
  - Verificacion: cierre de secuencia rechaza fin menor/igual, NaN y zonas obligatorias faltantes; secuencias validas guardan duracion y zonas inicio/fin.

- [x] ~~**FUN-04 - Timestamp - Timestamp manual acepta valores invalidos**~~
  - Severidad: Medio.
  - Evidencia: `src/renderer/views/tagging.js:2703`.
  - Impacto: eventos pueden quedar fuera de rango o mal ordenados.
  - Recomendacion: validar formato, rango y duracion del partido antes de guardar.
  - Verificacion: timestamp manual se parsea con funcion centralizada, rechaza valores invalidos/fuera de rango y permite vacio solo como evento sin tiempo en modo solo estadisticas.

- [x] ~~**FUN-05 - Timeline - Eventos sin timestamp desaparecen**~~
  - Severidad: Medio.
  - Evidencia: `src/renderer/components/timeline.js:242`.
  - Impacto: modo solo estadisticas queda parcialmente invisible.
  - Recomendacion: crear representacion "sin tiempo" o separar lista de eventos no temporales.
  - Verificacion: timeline temporal mantiene solo eventos con timestamp valido y agrega lista "Eventos sin tiempo" seleccionable/contextual para edicion o borrado.

- [x] ~~**FUN-06 - Posesion - Cierre automatico por gap temporal puede cortar segmentos**~~
  - Severidad: Medio.
  - Evidencia: `src/renderer/tagging/tagger.js:745`.
  - Impacto: segmentos de posesion incorrectos tras pausas, seeks o suspension.
  - Recomendacion: basar cierre en estado de reproduccion y cambios controlados, no solo delta temporal.
  - Verificacion: avance de posesion ya no cierra por delta temporal; cierre queda limitado a cambio explicito, seek controlado, fin/cleanup seguro y evita segmentos invalidos.

- [x] ~~**FUN-07 - Navegacion - Cleanup de Tagging guarda posesion sin manejo robusto**~~
  - Severidad: Bajo.
  - Evidencia: `src/renderer/views/tagging.js:620`, `src/renderer/views/tagging.js:2753`.
  - Impacto: posibles errores silenciosos o guardados incompletos al cambiar de pantalla.
  - Recomendacion: encapsular cierre de posesion con manejo explicito de errores.
  - Verificacion: cleanup encapsula cierre de posesion activa con `try/catch`, guardado seguro y feedback sin bloquear navegacion.

## Issues de datos/persistencia

- [x] ~~**DAT-01 - Eventos - Falta schema/rangos en `addEvent` y `updateEvent`**~~
  - Severidad: Alto.
  - Evidencia: `src/main/modules/events.js:11`, `src/main/modules/events.js:43`.
  - Impacto: datos corruptos entran a analytics, PDF y sync.
  - Recomendacion: validar con schema por tipo de evento en main process.
  - Verificacion: `addEvent` y `updateEvent` validan tipo, timestamp, equipo, resultado/subtipo por schema, zona, nota, duracion y fechas antes de persistir.

- [x] ~~**DAT-02 - Storage - JSON corruptos se saltean sin avisar**~~
  - Severidad: Medio.
  - Evidencia: `src/main/modules/storage.js:148`.
  - Impacto: partidos pueden "desaparecer" sin diagnostico.
  - Recomendacion: reportar estado recuperable y ofrecer reparacion/export.
  - Verificacion: `getAllMatches` devuelve partidos corruptos con `status: corrupt`, ruta y error resumido; Home muestra diagnostico sin sobrescribir el archivo.

- [x] ~~**DAT-03 - Sync - `pending-sync.json` corrupto se reemplaza logicamente por cola vacia**~~
  - Severidad: Alto.
  - Evidencia: `src/main/modules/storage.js:233`.
  - Impacto: puede perderse la cola local de sincronizacion.
  - Recomendacion: preservar archivo corrupto, crear backup y mostrar error de sync.
  - Verificacion: cola corrupta genera error recuperable y backup timestamped; una nueva cola se crea solo al encolar despues del respaldo.

- [x] ~~**DAT-04 - Tactical boards - Archivos corruptos se ignoran silenciosamente**~~
  - Severidad: Medio.
  - Evidencia: `src/main/modules/tactical-boards.js:360`.
  - Impacto: perdida aparente de tableros sin feedback.
  - Recomendacion: anadir estado de error recuperable y backup.
  - Verificacion: `listTacticalBoards` devuelve tableros corruptos con `status: corrupt`, ruta y error resumido sin ocultarlos ni borrar el archivo.

- [x] ~~**DAT-05 - MP4 metadata - Duracion no vuelve en metadata inicial**~~
  - Severidad: Bajo.
  - Evidencia: `src/main/modules/media.js:100`, `src/main/modules/media.js:200`, `src/renderer/views/tagging.js:1059`.
  - Impacto: sync/cache puede quedar incompleto antes de cargar metadata de video.
  - Recomendacion: persistir duracion cuando este disponible y marcar estado pendiente explicito.
  - Verificacion: metadata local inicial usa `durationStatus: pending`; Tagging persiste `durationStatus: available` con duracion real al cargar metadata.

- [x] ~~**DAT-06 - Dibujos / PDF - Frames base64 sin limite claro**~~
  - Severidad: Medio.
  - Evidencia: `src/main/modules/drawings.js:116`, `src/main/modules/drawings.js:399`.
  - Impacto: archivos grandes pueden degradar PDF y memoria.
  - Recomendacion: limitar tamano, cantidad y validar formato de imagenes.
  - Verificacion: frames PNG base64 invalidos o mayores al limite se rechazan; hay limite por partido y el PDF carga hasta el maximo permitido sin leer frames gigantes.

## Issues de seguridad

- [ ] **SEC-01 - CSP - `unsafe-inline` y directivas faltantes**
  - Severidad: Alto.
  - Evidencia: `src/renderer/index.html:7`.
  - Impacto: aumenta impacto de XSS.
  - Recomendacion: endurecer CSP y mover scripts inline si existen.

- [x] ~~**SEC-02 - Electron - BrowserWindow sin `sandbox: true`**~~
  - Severidad: Medio.
  - Evidencia: `src/main/main.js:68`.
  - Impacto: menor aislamiento del renderer.
  - Recomendacion: activar sandbox y ajustar preload si hace falta.
  - Verificacion: `npm test` paso; `BrowserWindow` usa `sandbox: true`.

- [x] ~~**SEC-03 - IPC / Archivos - Renderer puede abrir cualquier ruta local**~~
  - Severidad: Medio.
  - Evidencia: `src/main/ipc.js:308`, `src/main/preload.js:150`.
  - Impacto: exposicion innecesaria de rutas locales.
  - Recomendacion: restringir a archivos generados por la app o rutas permitidas.
  - Verificacion: `npm test` paso; `files.open` usa un canal autorizado y solo acepta rutas registradas por exportaciones.

- [x] ~~**SEC-04 - Sesion - API generica de `licenseSession` expuesta**~~
  - Severidad: Medio.
  - Evidencia: `src/main/ipc.js:141`, `src/main/preload.js:126`.
  - Impacto: superficie amplia para manipular sesion/licencia.
  - Recomendacion: exponer operaciones semanticas minimas, no key-value generico.
  - Verificacion: `npm test` paso; `authSession` valida la clave exacta `bigu-license-auth`.

- [x] ~~**SEC-05 - AI token - `clientToken` guardado plano en `electron-store`**~~
  - Severidad: Medio.
  - Evidencia: `src/main/modules/ai/aiConfig.js:19`, `src/main/modules/ai/aiConfig.js:45`.
  - Impacto: token local recuperable por usuario/proceso con acceso al perfil.
  - Recomendacion: usar store cifrado o `safeStorage`, con migracion.
  - Verificacion: `npm test` y `npm run security:check` pasaron; `clientToken` se guarda cifrado con `electron.safeStorage`, migra legacy plano y usa memoria si no hay cifrado disponible.

- [x] ~~**SEC-06 - PDF - Puppeteer con `--no-sandbox`**~~
  - Severidad: Medio.
  - Evidencia: `src/main/modules/pdf-export.js:73`.
  - Impacto: reduce aislamiento del proceso Chromium de exportacion.
  - Recomendacion: evitar `--no-sandbox` cuando sea posible o documentar restriccion Windows.
  - Verificacion: `npm test` y `npm run security:check` pasaron; PDF lanza Chromium con sandbox por defecto y solo usa `--no-sandbox` como fallback controlado con warning.

- [x] ~~**SEC-07 - Secret scan - Cobertura acotada**~~
  - Severidad: Bajo.
  - Evidencia: `scripts/check-ai-client-secrets.js:5`.
  - Impacto: puede no detectar secretos fuera del alcance definido.
  - Recomendacion: mantener este check y agregar uno general para repo/config sin imprimir valores.
  - Verificacion: `npm run security:check` paso; combina secret scan general del repo/config y scan especifico de secretos AI sin imprimir valores sensibles.

## Issues de performance

- [x] ~~**PERF-01 - Timeline - Re-render completo y listeners por bloque**~~
  - Severidad: Alto.
  - Evidencia: `src/renderer/components/timeline.js:239`, `src/renderer/components/timeline.js:399`.
  - Impacto: lag con partidos largos o muchos eventos.
  - Recomendacion: usar delegacion de eventos, render incremental o virtualizacion horizontal.
  - Verificacion: `npm test` paso; Timeline usa listeners delegados en el host, evita reconstruir DOM cuando cambia playhead/seleccion/posesion y mueve playhead con `requestAnimationFrame`. Test simula 2.500 eventos en video de mas de 2 horas.

- [x] ~~**PERF-02 - Posesion - Sync puede renderizar timeline y guardar periodicamente**~~
  - Severidad: Medio.
  - Evidencia: `src/renderer/views/tagging.js:1394`, `src/renderer/views/tagging.js:1795`.
  - Impacto: trabajo excesivo durante reproduccion.
  - Recomendacion: separar actualizacion visual ligera de persistencia debounced.
  - Verificacion: `npm test` paso; sync de posesion actualiza solo la vista liviana y la pista de posesion, guarda con throttle/dedupe por fingerprint y fuerza flush en cierres/seek/reset.

- [x] ~~**PERF-03 - Videos largos - MP4 de mas de 2 horas no validado**~~
  - Severidad: Medio.
  - Evidencia: `ROADMAP.md:377`.
  - Impacto: riesgo no cerrado para uso real.
  - Recomendacion: crear fixture/perf test con timeline grande y video largo simulado.
  - Verificacion: `npm test` paso; test de Timeline simula duracion mayor a 2 horas con eventos distribuidos, valida render inicial incremental, seek/playhead y scroll sin listeners por bloque.

- [x] ~~**PERF-04 - PDF - Muchos frames anotados pueden cargarse en memoria**~~
  - Severidad: Medio.
  - Evidencia: `src/main/modules/drawings.js:399`, `src/main/modules/pdf-export.js:62`.
  - Impacto: export lento o consumo alto de memoria.
  - Recomendacion: limitar frames, paginar o generar assets bajo demanda.
  - Verificacion: `npm test` paso; PDF lee bajo demanda hasta 80 frames anotados, valida tamano antes de leer, omite archivos faltantes/sobredimensionados y muestra aviso claro en el PDF.

- [x] ~~**PERF-05 - Cloud sync - Listado cloud descarga detalles y silencia fallos**~~
  - Severidad: Bajo.
  - Evidencia: `src/renderer/cloud/cloud-match-service.js:353`.
  - Impacto: Home puede volverse lento con muchas temporadas/partidos.
  - Recomendacion: cachear, paginar y mostrar estado parcial de sync.
  - Verificacion: `npm test` paso; listado usa summaries paginados, cache de 30 s, carga detalles solo bajo demanda y expone estado parcial/errores sin bloquear Home.

## Funcionalidades incompletas o inconsistentes

- [ ] **INC-01 - Heatmap standalone ausente**
  - Evidencia: `src/renderer/router.js:12`, `src/renderer/views/dashboard.js:2161`, `DESIGN.md:995`.
  - Riesgo: navegacion pedida incompleta.

- [ ] **INC-02 - Tagging minimalista no coincide con `DESIGN.md`**
  - Evidencia: `src/renderer/views/tagging.js:805`, `DESIGN.md:1178`.
  - Riesgo: UX principal no coincide con especificacion.

- [x] ~~**INC-03 - Dashboard seek pendiente**~~
  - Evidencia: `ROADMAP.md:273`.
  - Riesgo: exploracion metrica-video incompleta.
  - Verificacion: cerrado junto con FUN-01; Dashboard conserva `matchId` y abre Tagging en el timestamp del evento.

- [ ] **INC-04 - PDF Windows visual pendiente**
  - Evidencia: `ROADMAP.md:236`.
  - Riesgo: exportacion no validada visualmente para usuario final.

- [ ] **INC-05 - MP4 >2h sin lag pendiente**
  - Evidencia: `ROADMAP.md:377`.
  - Riesgo: performance no validada en partidos reales.

- [ ] **INC-06 - Instalacion Windows limpia pendiente**
  - Evidencia: `ROADMAP.md:386`.
  - Riesgo: distribucion no cerrada.

- [ ] **INC-07 - Alcance backend/cloud/AI inconsistente entre PRD y roadmap/codigo**
  - Evidencia: `PRD.md:630`, `ROADMAP.md:337`, `server/geminiClient.js:1`.
  - Riesgo: fuente de verdad de producto ambigua.

- [ ] **INC-08 - Provider AI inconsistente**
  - Evidencia: `PRD.md:704`, `server/geminiClient.js:1`.
  - Riesgo: documentacion y arquitectura no estan alineadas.
