create extension if not exists pgcrypto;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  license_status text not null default 'trial',
  max_users int not null default 2,
  max_devices int not null default 2,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_license_status_check check (license_status in ('trial', 'active', 'suspended', 'expired')),
  constraint clubs_max_users_check check (max_users > 0),
  constraint clubs_max_devices_check check (max_devices > 0)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  club_id uuid not null references public.clubs(id) on delete cascade,
  role text not null default 'analyst',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('owner', 'coach', 'analyst')),
  constraint profiles_status_check check (status in ('pending', 'approved', 'blocked'))
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint_hash text not null,
  device_name text null,
  platform text null,
  app_version text null,
  status text not null default 'pending',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint devices_status_check check (status in ('pending', 'approved', 'blocked')),
  constraint devices_fingerprint_hash_check check (fingerprint_hash ~ '^[a-f0-9]{64}$'),
  unique (club_id, fingerprint_hash)
);

create table if not exists public.license_checks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid null references public.clubs(id),
  user_id uuid null references auth.users(id),
  device_id uuid null references public.devices(id),
  result text not null,
  reason text null,
  app_version text null,
  created_at timestamptz not null default now(),
  constraint license_checks_result_check check (result in ('allowed', 'denied'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clubs_set_updated_at on public.clubs;
create trigger clubs_set_updated_at
before update on public.clubs
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.clubs enable row level security;
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.license_checks enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists "read own club" on public.clubs;
create policy "read own club"
on public.clubs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.club_id = clubs.id
  )
);

drop policy if exists "read own devices" on public.devices;
create policy "read own devices"
on public.devices
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "insert own pending device" on public.devices;
create policy "insert own pending device"
on public.devices
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.club_id = devices.club_id
  )
);

drop policy if exists "insert own license checks" on public.license_checks;
create policy "insert own license checks"
on public.license_checks
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.club_id = license_checks.club_id
  )
  and (
    device_id is null
    or exists (
      select 1
      from public.devices d
      where d.id = license_checks.device_id
        and d.user_id = auth.uid()
    )
  )
);

create or replace function public.touch_own_device_last_seen(
  p_device_id uuid,
  p_fingerprint_hash text,
  p_device_name text default null,
  p_platform text default null,
  p_app_version text default null
)
returns public.devices
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_device public.devices;
begin
  update public.devices
  set
    last_seen_at = now(),
    device_name = coalesce(nullif(p_device_name, ''), device_name),
    platform = coalesce(nullif(p_platform, ''), platform),
    app_version = coalesce(nullif(p_app_version, ''), app_version)
  where id = p_device_id
    and user_id = auth.uid()
    and fingerprint_hash = p_fingerprint_hash
  returning * into updated_device;

  if updated_device.id is null then
    raise exception 'device_not_found';
  end if;

  return updated_device;
end;
$$;

revoke all on function public.touch_own_device_last_seen(uuid, text, text, text, text) from public;
grant execute on function public.touch_own_device_last_seen(uuid, text, text, text, text) to authenticated;
