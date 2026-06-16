# Deploy del backend IA en Google Cloud Run

Esta guia despliega solo el backend IA de BiguAnalytics. Electron no se despliega en Cloud Run y nunca contiene `GEMINI_API_KEY` ni `SUPABASE_SERVICE_ROLE_KEY`.

## Requisitos

- Proyecto Google Cloud con billing activo.
- Google Cloud CLI autenticado.
- Proyecto Supabase operativo.
- Gemini API key creada fuera de Electron.
- Migracion `supabase/migrations/20260608010000_profiles_ai_access.sql` aplicada en Supabase.

## APIs a habilitar

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

## Secrets

```bash
printf "%s" "REEMPLAZAR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
printf "%s" "REEMPLAZAR_SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create supabase-service-role-key --data-file=-
```

`GEMINI_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` deben configurarse como secrets. `SUPABASE_URL` puede ser variable de entorno normal.

## Variables necesarias

Cloud Run inyecta `PORT`; no lo hardcodees. El contenedor debe escuchar en `0.0.0.0` y usar `process.env.PORT`.

```env
NODE_ENV=production
SUPABASE_URL=https://your-project.supabase.co
AI_BACKEND_HOST=0.0.0.0
AI_BACKEND_EXPOSE_NETWORK=true
AI_DAILY_REQUEST_LIMIT=200
AI_MAX_INPUT_CHARS=60000
GEMINI_API_KEY=gemini-api-key:latest
SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest
```

En produccion no configurar `ALLOWED_CLIENT_TOKENS`; el acceso IA se decide en `public.profiles`.

## Comando de start

```bash
npm run server
```

El `Dockerfile` usa:

```dockerfile
CMD ["npm", "run", "server"]
```

## Deploy

```bash
gcloud run deploy biguanalytics-ai \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,SUPABASE_URL=https://your-project.supabase.co,AI_BACKEND_HOST=0.0.0.0,AI_BACKEND_EXPOSE_NETWORK=true,AI_DAILY_REQUEST_LIMIT=200,AI_MAX_INPUT_CHARS=60000 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest
```

`--allow-unauthenticated` permite que Electron llegue al servicio. La autorizacion real la hace el backend con el access token Supabase.

Guardar URL:

```bash
SERVICE_URL="$(gcloud run services describe biguanalytics-ai --region us-central1 --format='value(status.url)')"
echo "$SERVICE_URL"
```

## Gestionar acceso IA

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

## Pruebas con curl

Health check:

```bash
curl -i "$SERVICE_URL/health"
```

Respuesta esperada:

```json
{"ok":true,"service":"biguanalytics-ai"}
```

Verificacion sin token:

```bash
curl -i "$SERVICE_URL/v1/ai/verify-auth"
```

Respuesta esperada: `401`.

Verificacion con access token Supabase valido:

```bash
curl -i "$SERVICE_URL/v1/ai/verify-auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
```

Respuesta esperada para usuario aprobado con IA:

```json
{"authenticated":true,"user_id":"...","status":"approved","ai_enabled":true,"ai_daily_limit":30,"role":"analyst"}
```

Smoke test de IA:

```bash
curl -i "$SERVICE_URL/v1/ai/generate-summary" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"matchData":{"events":[{"type":"ruck","team":"home","result":"ganado"}]}}'
```

## Configuracion en Electron

En `Ajustes -> IA`:

- URL del backend: URL publica de Cloud Run.
- Probar conexion: usa automaticamente el access token Supabase y llama a `/v1/ai/verify-auth`.

No hay campo de API key Gemini ni campo manual de token IA. En produccion Electron no debe usar `localhost` como backend por defecto.

## Rotacion

Rotar `GEMINI_API_KEY`:

```bash
printf "%s" "NUEVA_GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-
gcloud run services update biguanalytics-ai --region us-central1 --update-secrets GEMINI_API_KEY=gemini-api-key:latest
```

Rotar `SUPABASE_SERVICE_ROLE_KEY`:

1. Generar una nueva service role key desde Supabase.
2. Agregar nueva version del secret `supabase-service-role-key`.
3. Actualizar Cloud Run con `--update-secrets SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest`.
4. Probar `/v1/ai/verify-auth`.
5. Revocar la key anterior en Supabase.

## Verificacion del build Electron

```bash
npm run check:ai-secrets -- dist
```

Este comando revisa el build final generado en `dist` y falla si encuentra `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `.env.local`, `@google/genai`, llamadas directas a Google/Gemini o patrones tipicos de API keys.

## Referencias oficiales

- Cloud Run container runtime contract: https://docs.cloud.google.com/run/docs/container-contract
- Cloud Run secrets: https://docs.cloud.google.com/run/docs/configuring/services/secrets
- gcloud run deploy: https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy
- Supabase JavaScript Auth `getUser`: https://supabase.com/docs/reference/javascript/auth-getuser
