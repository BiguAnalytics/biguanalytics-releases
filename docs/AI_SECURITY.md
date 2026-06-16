# Seguridad IA BiguAnalytics

## Arquitectura

Electron no llama a Gemini. Renderer solicita IA por IPC, el main process arma un contexto deportivo sanitizado y llama al backend propio en Cloud Run. El backend valida Supabase Auth, consulta `public.profiles` y recien ahi llama a Gemini con `process.env.GEMINI_API_KEY`.

Flujo de produccion:

1. Usuario inicia sesion en Supabase Auth desde Electron.
2. Supabase persiste la sesion mediante storage IPC seguro.
3. Main process lee el `access_token` Supabase actual.
4. Main process llama al backend con `Authorization: Bearer <supabase_access_token>`.
5. Backend valida el token con Supabase usando `SUPABASE_SERVICE_ROLE_KEY`.
6. Backend consulta `public.profiles` para el `user.id`.
7. Backend permite IA solo si `status = 'approved'`, `ai_enabled = true` y `ai_revoked_at is null`.
8. Backend aplica rate limits por `user_id`, construye prompts controlados y llama a Gemini 2.5 Flash-Lite.
9. Backend devuelve JSON normalizado a Electron.

`GEMINI_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` nunca deben estar en Electron, `.exe`, renderer, main process, logs, localStorage, electron-store ni codigo empaquetado.

## Variables

Produccion Cloud Run:

```env
NODE_ENV=production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
AI_BACKEND_HOST=0.0.0.0
AI_BACKEND_EXPOSE_NETWORK=true
AI_DAILY_REQUEST_LIMIT=200
AI_MAX_INPUT_CHARS=60000
```

Cloud Run inyecta `PORT`. El backend escucha en `process.env.PORT` y, en produccion, en `0.0.0.0`.

## Profiles

`public.profiles` es la unica fuente de permisos IA:

```sql
status text not null default 'pending'
ai_enabled boolean not null default false
ai_daily_limit integer not null default 30
ai_revoked_at timestamptz null
role text null
```

Estados validos:

- `pending`
- `approved`
- `rejected`
- `suspended`

Para aprobar usuario con IA:

```sql
update public.profiles
set status = 'approved',
    ai_enabled = true,
    ai_daily_limit = 30,
    ai_revoked_at = null,
    role = 'analyst'
where id = '00000000-0000-4000-8000-000000000001';
```

Para quitar IA pero permitir acceso a la app:

```sql
update public.profiles
set ai_enabled = false
where id = '00000000-0000-4000-8000-000000000001';
```

Para suspender completamente:

```sql
update public.profiles
set status = 'suspended'
where id = '00000000-0000-4000-8000-000000000001';
```

Para revocar IA:

```sql
update public.profiles
set ai_revoked_at = now()
where id = '00000000-0000-4000-8000-000000000001';
```

Un access token valido sin profile, con `status <> 'approved'`, con `ai_enabled = false` o con `ai_revoked_at` devuelve `403`.

## RLS

El cliente Electron puede leer su propio profile si la app lo necesita. El backend usa `SUPABASE_SERVICE_ROLE_KEY` solo en Cloud Run para leer `profiles`.

La migracion `20260608010000_profiles_ai_access.sql` protege campos administrativos con `prevent_profile_privilege_update`. Un usuario normal no puede autoaprobarse ni modificar:

- `status`
- `ai_enabled`
- `ai_daily_limit`
- `ai_revoked_at`
- `role`

Los campos personales editables por el usuario siguen separados (`first_name`, `last_name`, `age`, `app_role`, `is_player`, `position`); `display_name` se genera desde esos datos y no concede permisos.

## Endpoints

- `GET /health`: no requiere auth y no revela secretos.
- `GET /v1/ai/verify-auth`: requiere access token Supabase.
- `POST /v1/ai/analyze-match`: requiere access token Supabase.
- `POST /v1/ai/generate-summary`: requiere access token Supabase.
- `POST /v1/ai/detect-patterns`: requiere access token Supabase.

`GET /v1/ai/verify-auth` devuelve solo datos seguros:

```json
{
  "authenticated": true,
  "user_id": "...",
  "status": "approved",
  "ai_enabled": true,
  "ai_daily_limit": 30,
  "role": "analyst"
}
```

## Rate limits

El backend aplica:

- limite por minuto usando `user_id + IP`
- limite diario usando solo `user_id`
- limite diario por usuario tomado de `profiles.ai_daily_limit`
- limite de tamano con `AI_MAX_INPUT_CHARS`

`429` indica limite alcanzado. `413` indica input demasiado grande.

## Configuracion en la app

En `Ajustes -> IA`:

- URL del backend: URL publica de Cloud Run.
- Probar conexion: llama a `/v1/ai/verify-auth` con el access token Supabase actual.

No hay campo de API key Gemini ni campo manual de token IA. En produccion Electron no debe asumir `localhost`.

## Datos enviados

Electron envia solo JSON deportivo estructurado desde main process:

- equipos anonimizados/estructurados
- fecha y competencia si existen
- eventos taggeados
- metricas calculadas
- secuencias
- posesion
- penales, rucks, line outs, scrums, kicks
- notas deportivas de eventos, recortadas
- jugadores anonimizados como `P01`, `P02`

`coachNotes` no se incluye por defecto en payload ni en hash/cache. La UI actual no activa `includeCoachNotes`.

Nunca se envian videos, clips MP4, imagenes, rutas absolutas, URLs de YouTube, thumbnails, roster/nombres reales, access tokens completos, refresh tokens, secrets, datos medicos ni datos personales sensibles.

## Logs

El backend registra solo:

- fecha
- endpoint
- `user_id`
- `profileStatus`
- `aiEnabled`
- tamano aproximado del input
- exito/error
- status HTTP
- uso de tokens si Gemini lo devuelve

No se loguean access tokens completos, API keys, service role keys, prompts completos ni respuestas completas.

## Rotacion

Rotar acceso IA de un usuario:

1. Cambiar `profiles.ai_enabled`, `profiles.ai_revoked_at` o `profiles.status`.
2. Si hace falta, cerrar sesiones Supabase del usuario.
3. Probar que `/v1/ai/verify-auth` devuelva `403`.

Rotar `GEMINI_API_KEY` o `SUPABASE_SERVICE_ROLE_KEY`: crear nueva version del secret en Google Secret Manager, actualizar Cloud Run, probar `/health` y `/v1/ai/verify-auth`, y revocar la key anterior.

## Verificacion

```bash
npm run security:check
npm run check:ai-secrets -- dist
```

El build Electron no debe contener `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `.env.local`, `@google/genai` ni llamadas directas a Google/Gemini desde renderer o main.
