# Tester B — reporte exploratorio live de módulos

- Fecha: 2026-08-06T23:02:52.280Z
- Rama observada: test/exploratory-qa
- Runtime: Electron real con Playwright `_electron`
- Ejecutable empaquetado usado para recorrer módulos: ../../dist/win-unpacked/BiguAnalytics.exe
- UserData de datos funcionales: no creado
- Evidencia: evidence/tester-b-modules-2026-08-06T23-02-50-665Z
- Nota de autenticación: se usó el modo local/dev existente y la sesión local disponible para el shell; los datos de partidos, plantillas y tableros se escribieron en un userData temporal.

## Cobertura y estado

- dashboard: no alcanzable en la ejecución live (ver bloqueo de arranque/autenticación).
- temporada: no alcanzable en la ejecución live (ver bloqueo de arranque/autenticación).
- configuracion: no alcanzable en la ejecución live (ver bloqueo de arranque/autenticación).
- tablero tactico: no alcanzable en la ejecución live (ver bloqueo de arranque/autenticación).
- editor PDF: no alcanzable en la ejecución live (ver bloqueo de arranque/autenticación).
- tema claro/oscuro: hubo una acción fallida; revisar hallazgos.
- tagging: no alcanzable en la ejecución live (ver bloqueo de arranque/autenticación).
- guardado/lectura JSON local: no alcanzable en la ejecución live (ver bloqueo de arranque/autenticación).

Acciones instrumentadas: 0. Capturas: 0. Lecturas de JSON local: 0.

## Hallazgos

### 1. [alta] No se pudo iniciar Electron fuente para la exploración
- Módulo: arranque / todos los módulos
- Hallazgo: electron.launch: Target page, context or browser has been closed Browser logs: <launching> "C:\Files\Rugby\BiguAnalytics\node_modules\electron\dist\electron.exe" "--inspect=0" "--remote-debugging-port=0" "." "--dev" <launched> pid=16616 [pid=16616][out] [pid=16616][err] Debugger listening on ws://127.0.0.1:62374/9a903608-6f1e-442d-9a43-5cb12ab03834 [pid=16616][err] For help, see: https://nodejs.org/en/docs/inspector [pid=16616][err] Debugger attached. [pid=16616][out] [startup] {"label":"main:start","totalMs":0,"deltaMs":0} [pid=16616][err] [pid=16616][err] DevTools listening on ws://127.0.0.1:62376/devtools/browser/9b6d9b58-c9f1-46e3-9fe7-c5bb8dfeb2fc Call log: [2m - <launching> "C:\Files\Rugby\BiguAnalytics\node_modules\electron\dist\electron.exe" "--inspect=0" "--remote-debugging-port=0" "." "--dev"[22m [2m - <launched> pid=16616[22m [2m - [pid=16616][out][22m [2m - [pid=16616]
- Pasos de reproducción: Ejecutar el bloque de arranque fuente del test.
- Evidencia:
  - Capturas de la acción asociada en `evidence/`.

### 2. [alta] La exploración live se interrumpió por un error del runner
- Módulo: ejecución Electron
- Hallazgo: electron.launch: Target page, context or browser has been closed Browser logs: <launching> "C:\Files\Rugby\BiguAnalytics\node_modules\electron\dist\electron.exe" "--inspect=0" "--remote-debugging-port=0" "C:\Files\Rugby\BiguAnalytics" "--dev" <launched> pid=47268 [pid=47268][out] [pid=47268][err] Debugger listening on ws://127.0.0.1:62378/f846de75-2a27-4f7f-9ec3-bdac387f5d00 [pid=47268][err] For help, see: https://nodejs.org/en/docs/inspector [pid=47268][err] Debugger attached. [pid=47268][out] [startup] {"label":"main:start","totalMs":0.1,"deltaMs":0.1} [pid=47268][err] [pid=47268][err] DevTools listening on ws://127.0.0.1:62380/devtools/browser/3496605e-af84-4401-b250-b6a29043890f Call log: [2m - <launching> "C:\Files\Rugby\BiguAnalytics\node_modules\electron\dist\electron.exe" "--inspect=0" "--remote-debugging-port=0" "C:\Files\Rugby\BiguAnalytics" "--dev"[22m [2m - <launched> pid=
- Pasos de reproducción: Ejecutar nuevamente el test con Playwright disponible y el ejecutable Electron accesible.
- Evidencia:
  - Capturas de la acción asociada en `evidence/`.

## Errores y warnings observados

### Renderer

- No se registraron errores, warnings ni excepciones del renderer.

### Main

- No se registraron errores del proceso main.

## Acciones ejecutadas

| Módulo | Acción | Resultado | Primer intento | Reintento | Evidencia |
|---|---|---|---|---|---|


## Guardado/lectura JSON local

- No se pudo completar una lectura.

## Evidencia de ejecución

- Manifest: `evidence/tester-b-modules-2026-08-06T23-02-50-665Z/run-manifest.json`
- Logs renderer/main: `evidence/tester-b-modules-2026-08-06T23-02-50-665Z/renderer-main-logs.json`
- Lecturas JSON: `evidence/tester-b-modules-2026-08-06T23-02-50-665Z/local-json-readings.json`
