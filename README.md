# BiguAnalytics

Aplicacion Electron de analisis de rugby para escritorio Windows. Los partidos siguen manteniendo un cache local en `data/{matchId}/match.json` y pueden sincronizar datos livianos del club con Supabase.

## Variables de entorno del cliente

Configurar variables en el entorno de ejecucion o build del cliente:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_public_key
```

`SUPABASE_URL` puede venir como `https://project.supabase.co/rest/v1/`; la app lo normaliza a `https://project.supabase.co`.
En desarrollo, tambien se puede crear `C:\Files\Rugby\BiguAnalytics\.env`. En Windows instalado, la app busca `.env` en la carpeta de datos de usuario, `resources` y junto al `.exe`; tambien lee variables de entorno de usuario/sistema. Se aceptan aliases publicos comunes: `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

No usar ni empaquetar `service_role`, JWT secrets ni claves privadas en Electron. La publishable key es publica, pero no se hardcodea en el repo.

## IA

Electron no guarda ni llama con la API key del proveedor IA. La app se configura en Ajustes -> Configuracion IA con URL del backend propio y un token de cliente revocable. El proveedor activo del backend es Gemini 2.5 Flash-Lite con `GEMINI_API_KEY` solo en el entorno del servidor. El backend se ejecuta con:

```bash
npm run server
```

Por defecto escucha solo en `127.0.0.1:8787`. Para exponerlo a otra maquina de la red hay que configurar `AI_BACKEND_HOST=0.0.0.0` y `AI_BACKEND_EXPOSE_NETWORK=true`; usarlo solo detras de firewall/VPN y con tokens revocables.

Ver [docs/AI_SECURITY.md](docs/AI_SECURITY.md) para variables, rotacion de tokens y datos enviados.

## Supabase

1. Crear un proyecto Supabase.
2. Ejecutar todas las migraciones en orden, incluyendo `supabase/migrations/20260609000000_open_signup_device_approval.sql`, `supabase/migrations/20260609010000_required_profile_completion.sql` y `supabase/migrations/20260610000000_device_identity_v2.sql`.
3. En Supabase Dashboard activar `Authentication -> Providers -> Email -> Allow new users to sign up`.
4. Insertar el club Bigua en `public.clubs` con `slug = 'bigua'`.
5. El login de la app usa OTP con `shouldCreateUser: true`; Supabase Auth crea el usuario si no existe.
6. En el primer ingreso la app crea `public.profiles` con `status = 'approved'`, `role = 'analyst'`, `ai_enabled = false`, `ai_daily_limit = 30` y el club Bigua default.
7. Antes de registrar el dispositivo, el usuario completa nombre, apellido, edad, rol visible del club y posicion si es jugador.
8. La app crea el dispositivo actual en `public.devices` con `status = 'pending'`.
9. Aprobar manualmente el dispositivo cambiando `public.devices.status` a `approved`.
10. Para habilitar IA, cambiar manualmente `public.profiles.ai_enabled` a `true`.

La app cliente no autoaprueba dispositivos, no modifica `devices.status`, no activa IA, no consume cupos automaticamente y no usa `service_role`.

La identidad de dispositivo v2 no usa WiFi, IP, router, gateway, DNS, SSID, ubicacion, proveedor de internet ni MAC. Usa `installation_id` local hasheado, `MachineGuid` de Windows hasheado si esta disponible, plataforma y version/salt interno. Cambiar de red no crea un device nuevo; borrar AppData puede requerir recuperacion por `machine_id_hash` o una nueva aprobacion si no hay identidad recuperable.

## Cloud Sync liviano

Supabase guarda solo datos livianos del club: partidos, metadata, eventos, posesiones, secuencias, notas y referencias de video.

No se suben videos MP4, PDFs pesados ni dashboards renderizados. El dashboard se calcula localmente desde los eventos sincronizados y el cache `match.json`.

Para YouTube, el partido se reproduce desde el mismo link/video id. Para MP4 local, cada dispositivo debe seleccionar el mismo archivo usado para taggear; la app valida nombre, tamano, duracion y fingerprint. Si no coincide, se permite continuar con advertencia porque los timestamps pueden no coincidir.

Sin internet, una ultima licencia activa cacheada permite trabajar contra el JSON local y los cambios quedan como `pending_sync`. Al volver la conexion, la app intenta sincronizarlos automaticamente.

## Licencias

El acceso queda permitido solo si:

- `profiles.status = 'approved'`
- perfil personal completo (`first_name`, `last_name`, `age`, `app_role`; tambien `position` si `app_role = 'jugador'`)
- `clubs.license_status` es `trial` o `active`
- `clubs.expires_at` es `null` o posterior a la fecha actual
- `devices.status = 'approved'`
- `devices.revoked_at is null`

`profiles.status = 'suspended'` o `rejected` bloquea al usuario. `devices.status = 'rejected'` o `revoked`, o `devices.revoked_at` con valor, bloquea solo ese dispositivo.

Sin internet, la app permite acceso si existe una licencia activa cacheada, el club no esta vencido y el ultimo estado cacheado tenia profile completo y device aprobado. Un profile incompleto o un device `pending`, `rejected` o `revoked` no renueva offline grace. Al reconectar, Supabase vuelve a validar licencia, usuario y dispositivo.

Ver [docs/ACCESS_ADMIN.md](docs/ACCESS_ADMIN.md) para el flujo manual de aprobacion de dispositivos e IA.

## Desarrollo

```bash
npm install
npm start
npm test
```

## PDF

La exportacion PDF revalida licencia activa antes de abrir el dialogo nativo. Cada PDF incluye un footer discreto con club, email y slug de licencia.
