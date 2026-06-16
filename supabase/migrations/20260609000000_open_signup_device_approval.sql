create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.profiles
  add column if not exists ai_enabled boolean not null default false,
  add column if not exists ai_daily_limit integer not null default 30,
  add column if not exists ai_revoked_at timestamptz null;

alter table public.profiles
  alter column status set default 'approved',
  alter column role set default 'analyst',
  alter column ai_enabled set default false,
  alter column ai_daily_limit set default 30;

update public.profiles set status = 'rejected' where status = 'blocked';

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check check (status in ('pending', 'approved', 'rejected', 'suspended'));

alter table public.devices
  add column if not exists device_fingerprint text null,
  add column if not exists display_name text null,
  add column if not exists approved_at timestamptz null,
  add column if not exists revoked_at timestamptz null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.devices set status = 'rejected' where status = 'blocked';

update public.devices
set revoked_at = coalesce(revoked_at, now())
where status = 'rejected'
  and revoked_at is null;

update public.devices
set device_fingerprint = fingerprint_hash
where device_fingerprint is null
  and fingerprint_hash is not null;

alter table public.devices drop constraint if exists devices_status_check;
alter table public.devices
  add constraint devices_status_check check (status in ('pending', 'approved', 'rejected', 'revoked'));

alter table public.devices drop constraint if exists devices_club_id_fingerprint_hash_key;
create unique index if not exists devices_user_fingerprint_unique
on public.devices (club_id, user_id, fingerprint_hash);

drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

create or replace function public.default_bigua_club_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.clubs
  where slug = 'bigua'
  limit 1
$$;

revoke all on function public.default_bigua_club_id() from public;
grant execute on function public.default_bigua_club_id() to authenticated;

drop policy if exists "read default signup club" on public.clubs;
create policy "read default signup club"
on public.clubs
for select
to authenticated
using (slug = 'bigua');

drop policy if exists "insert own approved analyst profile" on public.profiles;
create policy "insert own approved analyst profile"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', email))
  and club_id = public.default_bigua_club_id()
  and status = 'approved'
  and role = 'analyst'
  and ai_enabled = false
  and ai_daily_limit = 30
  and ai_revoked_at is null
);

create or replace function public.profiles_prevent_admin_field_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and (
    new.status is distinct from old.status
    or new.role is distinct from old.role
    or new.club_id is distinct from old.club_id
    or new.ai_enabled is distinct from old.ai_enabled
    or new.ai_daily_limit is distinct from old.ai_daily_limit
    or new.ai_revoked_at is distinct from old.ai_revoked_at
  ) then
    raise exception 'profile_admin_fields_are_read_only';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_admin_field_update on public.profiles;
create trigger profiles_prevent_admin_field_update
before update on public.profiles
for each row execute function public.profiles_prevent_admin_field_update();

drop policy if exists "insert own pending device" on public.devices;
create policy "insert own pending device"
on public.devices
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and approved_at is null
  and revoked_at is null
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and p.club_id = devices.club_id
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
    display_name = coalesce(nullif(p_device_name, ''), display_name),
    platform = coalesce(nullif(p_platform, ''), platform),
    app_version = coalesce(nullif(p_app_version, ''), app_version),
    device_fingerprint = coalesce(device_fingerprint, p_fingerprint_hash)
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
