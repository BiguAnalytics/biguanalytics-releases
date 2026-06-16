# Administracion de acceso

## Configuracion inicial

En Supabase Dashboard activar `Authentication -> Providers -> Email -> Allow new users to sign up`.

Aplicar las migraciones en orden, incluyendo:

- `supabase/migrations/20260609000000_open_signup_device_approval.sql`
- `supabase/migrations/20260609010000_required_profile_completion.sql`
- `supabase/migrations/20260610000000_device_identity_v2.sql`

El club default para auto-registro es el registro de `public.clubs` con `slug = 'bigua'`.

## Nuevo usuario y dispositivo

1. El usuario abre BiguAnalytics e ingresa su email.
2. Supabase Auth crea el usuario si no existe y envia OTP por email.
3. La app crea `public.profiles` si falta:
   - `status = 'approved'`
   - `role = 'analyst'`
   - `ai_enabled = false`
   - `ai_daily_limit = 30`
   - `ai_revoked_at = null`
   - `club_id = Bigua Rugby Club`
4. Antes de registrar el dispositivo, la app exige completar `first_name`, `last_name`, `age`, `app_role` y, si `app_role = 'jugador'`, `position`.
5. `display_name` se genera automaticamente desde nombre e inicial del apellido.
6. La app crea `public.devices` para el fingerprint v2 actual con `status = 'pending'`.
7. La app muestra `Dispositivo pendiente de aprobacion`.

## Identidad de dispositivo v2

La identidad del dispositivo no depende de WiFi, IP publica, IP local, router, gateway, DNS, SSID, ubicacion, proveedor de internet ni MAC del adaptador activo.

El fingerprint v2 usa:

- namespace fijo `BiguAnalytics`
- `installation_id` local generado una vez y enviado solo como hash
- `MachineGuid` de Windows si se puede leer, enviado solo como hash
- `platform`
- version/salt interno de identidad

No se guarda `MachineGuid` crudo en Supabase ni en logs. `device_name` como `PCMaxi` es solo metadata visible para administracion y diagnostico; no es un factor unico de aprobacion.

Si se cambia de WiFi o IP, el device aprobado sigue aprobado. Si se borra AppData, se pierde el `installation_id`; si el device ya fue migrado a v2 y Windows conserva el mismo `MachineGuid`, la app puede recuperar la PC por `machine_id_hash`. Si se cambia realmente de PC o instalacion sin identidad recuperable, se crea un nuevo device `pending`.

## Aprobar acceso

1. Ir a Supabase -> Table Editor -> `devices`.
2. Buscar por `user_id`, email via `profiles`, `device_name`, `display_name` o `fingerprint_hash`.
3. Cambiar `devices.status` de `pending` a `approved`.
4. Opcional: completar `approved_at = now()`.
5. El usuario toca `Reintentar` y entra.

## Habilitar IA

Para habilitar IA a un usuario aprobado:

```sql
update public.profiles
set
  ai_enabled = true,
  ai_revoked_at = null
where id = '<user_id>';
```

Para quitar IA sin bloquear la app:

```sql
update public.profiles
set ai_enabled = false
where id = '<user_id>';
```

## Revocar acceso

Para bloquear solo un dispositivo:

```sql
update public.devices
set
  status = 'revoked',
  revoked_at = now()
where id = '<device_id>';
```

Para rechazar un dispositivo nuevo:

```sql
update public.devices
set status = 'rejected'
where id = '<device_id>';
```

## Limpieza manual de duplicados

No borrar duplicados automaticamente. Primero listar los devices del usuario, nombre y plataforma:

```sql
select
  id,
  user_id,
  device_name,
  platform,
  status,
  fingerprint_version,
  first_seen_at,
  last_seen_at,
  approved_at,
  revoked_at
from public.devices
where user_id = '<user_id>'
  and device_name = 'PCMaxi'
  and platform = 'win32-x64'
order by
  case when status = 'approved' and revoked_at is null then 0 else 1 end,
  coalesce(last_seen_at, first_seen_at) desc;
```

Preferir el `approved` mas reciente. Si hay un `pending` duplicado creado por un cambio de hash anterior, rechazarlo:

```sql
update public.devices
set
  status = 'rejected',
  revoked_at = coalesce(revoked_at, now())
where id = '<duplicate_pending_device_id>'
  and status = 'pending';
```

Para bloquear completamente al usuario:

```sql
update public.profiles
set status = 'suspended'
where id = '<user_id>';
```

## Seguridad

El cliente Electron usa solo `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.

Nunca configurar `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, JWT secrets ni claves privadas en Electron.

El cliente puede insertar su propio profile con defaults seguros, completar campos personales visibles y crear su propio device `pending`. No puede aprobar devices, revocar devices, cambiar `profiles.status`, cambiar `profiles.role`, activar IA ni cambiar limites IA.
