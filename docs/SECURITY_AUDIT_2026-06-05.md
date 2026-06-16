# Security audit 2026-06-05

## Alcance

- Producto: BiguAnalytics Electron Windows desktop.
- Fuente offline critica: `data/{matchId}/match.json`.
- Capas revisadas: infraestructura local, dependencias, puertos, Electron main/preload/IPC, backend IA, renderer, Supabase, storage local, secretos y performance.

## Cambios aplicados

| Prioridad | Area | Cambio | Estado |
| --- | --- | --- | --- |
| P0 | Dependencias | `electron` actualizado a rango corregido y `vitest` a `4.1.8`; `npm audit` queda en 0 vulnerabilidades. | Hecho |
| P0 | Backend IA | `npm run server` ahora escucha en `127.0.0.1:8787` por defecto. Exponer red requiere `AI_BACKEND_EXPOSE_NETWORK=true`. | Hecho |
| P0 | Backend IA | `ALLOWED_CLIENT_TOKENS` se normaliza a hashes SHA-256 en memoria; no se conserva la lista en texto plano. | Hecho |
| P0 | Electron | `webSecurity: true`, `allowRunningInsecureContent: false`, bloqueo de `window.open` y bloqueo de navegacion top-level fuera del documento actual. | Hecho |
| P0 | Secretos | `npm run security:check` verifica repo y cliente empaquetable sin API keys IA ni `.env.local` en renderer/main/build. | Hecho |
| P1 | Documentacion | `.env.example`, `server/.env.example`, README y AI_SECURITY documentan puerto, host y opt-in de exposicion. | Hecho |

## Hallazgos por capa

### Infraestructura y puertos

- Puerto propio identificado: backend IA opcional `8787/tcp`.
- Estado anterior: `server/index.js` usaba `app.listen(port)` y podia quedar en interfaces no deseadas segun runtime.
- Estado actual: bind local `127.0.0.1` por defecto; `0.0.0.0` y `::` requieren opt-in explicito.
- `Get-NetTCPConnection -State Listen` no mostro `8787` activo durante la auditoria; los listeners en `0.0.0.0` observados pertenecian a servicios externos al proyecto.

### Dependencias

- `npm audit --audit-level=moderate --json` detecto vulnerabilidades en `electron` y `vitest`.
- Remediacion: upgrade via `npm install --save-dev electron@^42.3.3 vitest@^4.1.8`.
- Resultado posterior: `npm audit --audit-level=moderate` -> 0 vulnerabilidades.

### Electron e IPC

- Controles ya presentes: `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`, `sandbox: true`, CSP sin `unsafe-eval`, permisos de microfono limitados a audio.
- Controles agregados: `webSecurity`, bloqueo de contenido inseguro, bloqueo de ventanas nuevas y navegacion top-level.
- IPC revisado: preload expone APIs por dominio; operaciones de archivos pasan por dialogos nativos y `exports:openPath` solo abre rutas registradas por exportaciones.
- Riesgo residual: mantener tests de `ipc.js` cuando se agreguen canales nuevos; todo canal debe validar shape, IDs y rutas antes de tocar disco.

### Backend IA y datos sensibles

- La API key del proveedor queda solo en entorno del backend (`GEMINI_API_KEY`).
- Electron guarda solo token cliente revocable, cifrado con `safeStorage` cuando esta disponible.
- Backend valida bearer token, rate limit por token/IP, limite de body, limite de input deportivo y sanitizacion de match data.
- Cambio aplicado: tokens permitidos se comparan por hash, no como lista en texto plano.
- Riesgo residual: si se expone el backend a LAN/Internet, exigir firewall/VPN, TLS, tokens por dispositivo y rotacion.

### Renderer y XSS

- CSP bloquea scripts inline y `unsafe-eval`; `style-src 'unsafe-inline'` queda justificado por estilos dinamicos.
- Tests existentes cubren casos de confirm dialog, modal y Home contra interpolacion HTML insegura.
- Riesgo residual: hay uso extenso de `innerHTML` con helpers de escape. Mantener regla: datos de usuario siempre via `textContent` o `escapeHtml`, nunca interpolacion directa.

### Supabase y usuarios/passwords

- Migraciones revisadas: RLS habilitado en `clubs`, `profiles`, `devices`, `license_checks`, `matches`, `video_references`, `match_events`, `match_possessions`, `match_sequences`, `match_notes`.
- Passwords se gestionan en Supabase Auth; `profiles.password_set_at` es metadata, no password.
- Cliente usa publishable key; tests rechazan `SUPABASE_SERVICE_ROLE_KEY` en config cliente.
- Riesgo residual: aplicar migraciones en orden y auditar policies en Supabase Dashboard antes de produccion.

### Storage local

- Invariante preservado: `data/{matchId}/match.json` sigue siendo cache offline compatible por partido.
- `.gitignore` mantiene `data/*` fuera del repo salvo `.gitkeep`.
- Videos, clips y PDFs no se suben a nube segun PRD; Supabase guarda metadata liviana.

## Plan de remediacion restante

1. P0 continuo: ejecutar `npm audit`, `npm run security:check` y `npm test` antes de cada release.
2. P1: configurar firma de codigo Windows; el build actual valida instalacion, pero `signAndEditExecutable: false` deja SmartScreen como riesgo operativo.
3. P1: crear checklist manual de firewall para cualquier despliegue de `AI_BACKEND_HOST=0.0.0.0`.
4. P1: reducir gradualmente `innerHTML` en pantallas con datos de usuario hacia builders DOM o componentes seguros.
5. P2: agregar CI que bloquee PR si aparecen `.env`, service role, API keys o puertos expuestos sin documentacion.
6. P2: revisar Supabase RLS con usuarios de prueba por club antes de compartir metadata real.

## Performance posterior

- `npm run test:perf:timeline`: 34 tests pass, 1.02s.
- Escenario cubierto: timeline de partido >2h con 2500 eventos simulados, seek, scroll, playhead y delegacion de eventos.
- Resultado: no se detecto regresion de performance por el hardening aplicado.
- Limitacion: no reemplaza prueba manual con MP4 real largo en Windows instalado.

## Verificacion ejecutada

```powershell
npm audit --audit-level=moderate
npm run security:check
npm run check:windows-build
npm run test:perf:timeline
npm test
```

Resultados:

- `npm audit --audit-level=moderate`: 0 vulnerabilities.
- `npm run security:check`: Secret scan passed; AI client secret scan passed.
- `npm run check:windows-build`: Windows build validation passed.
- `npm run test:perf:timeline`: 34 passed.
- `npm test`: 536 passed.
