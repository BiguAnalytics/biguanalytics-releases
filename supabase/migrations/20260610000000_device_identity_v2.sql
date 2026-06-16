create extension if not exists pgcrypto;

alter table public.devices
  add column if not exists fingerprint_version integer not null default 1,
  add column if not exists installation_id_hash text null,
  add column if not exists machine_id_hash text null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.devices drop constraint if exists devices_fingerprint_version_check;
alter table public.devices
  add constraint devices_fingerprint_version_check check (fingerprint_version >= 1);

alter table public.devices drop constraint if exists devices_installation_id_hash_check;
alter table public.devices
  add constraint devices_installation_id_hash_check check (installation_id_hash is null or installation_id_hash ~ '^[a-f0-9]{64}$');

alter table public.devices drop constraint if exists devices_machine_id_hash_check;
alter table public.devices
  add constraint devices_machine_id_hash_check check (machine_id_hash is null or machine_id_hash ~ '^[a-f0-9]{64}$');

drop index if exists public.devices_user_fingerprint_unique;
create unique index devices_user_fingerprint_unique
on public.devices (club_id, user_id, fingerprint_hash)
where status in ('pending', 'approved')
  and revoked_at is null;

drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

create or replace function public.assert_device_identity_v2_input(
  p_fingerprint_hash text,
  p_installation_id_hash text,
  p_machine_id_hash text
)
returns void
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_fingerprint_hash is null or p_fingerprint_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_device_fingerprint_hash';
  end if;

  if p_installation_id_hash is not null and p_installation_id_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_installation_id_hash';
  end if;

  if p_machine_id_hash is not null and p_machine_id_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_machine_id_hash';
  end if;
end;
$$;

revoke all on function public.assert_device_identity_v2_input(text, text, text) from public, anon;
grant execute on function public.assert_device_identity_v2_input(text, text, text) to authenticated;

create or replace function public.touch_own_device_identity_v2(
  p_device_id uuid,
  p_fingerprint_hash text,
  p_fingerprint_version integer default 2,
  p_installation_id_hash text default null,
  p_machine_id_hash text default null,
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
  perform public.assert_device_identity_v2_input(p_fingerprint_hash, p_installation_id_hash, p_machine_id_hash);

  update public.devices
  set
    last_seen_at = now(),
    fingerprint_version = 2,
    installation_id_hash = p_installation_id_hash,
    machine_id_hash = p_machine_id_hash,
    device_name = coalesce(nullif(p_device_name, ''), device_name),
    display_name = coalesce(nullif(p_device_name, ''), display_name),
    platform = coalesce(nullif(p_platform, ''), platform),
    app_version = coalesce(nullif(p_app_version, ''), app_version),
    device_fingerprint = p_fingerprint_hash
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

revoke all on function public.touch_own_device_identity_v2(uuid, text, integer, text, text, text, text, text) from public, anon;
grant execute on function public.touch_own_device_identity_v2(uuid, text, integer, text, text, text, text, text) to authenticated;

create or replace function public.migrate_own_device_identity_v2(
  p_device_id uuid,
  p_fingerprint_hash text,
  p_fingerprint_version integer default 2,
  p_installation_id_hash text default null,
  p_machine_id_hash text default null,
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
  perform public.assert_device_identity_v2_input(p_fingerprint_hash, p_installation_id_hash, p_machine_id_hash);

  update public.devices
  set
    status = 'rejected',
    revoked_at = coalesce(revoked_at, now())
  where id <> p_device_id
    and user_id = auth.uid()
    and fingerprint_hash = p_fingerprint_hash
    and status = 'pending'
    and revoked_at is null;

  update public.devices
  set
    fingerprint_hash = p_fingerprint_hash,
    device_fingerprint = p_fingerprint_hash,
    fingerprint_version = 2,
    installation_id_hash = p_installation_id_hash,
    machine_id_hash = p_machine_id_hash,
    last_seen_at = now(),
    device_name = coalesce(nullif(p_device_name, ''), device_name),
    display_name = coalesce(nullif(p_device_name, ''), display_name),
    platform = coalesce(nullif(p_platform, ''), platform),
    app_version = coalesce(nullif(p_app_version, ''), app_version)
  where id = p_device_id
    and user_id = auth.uid()
    and status = 'approved'
    and revoked_at is null
  returning * into updated_device;

  if updated_device.id is null then
    raise exception 'device_not_found';
  end if;

  return updated_device;
end;
$$;

revoke all on function public.migrate_own_device_identity_v2(uuid, text, integer, text, text, text, text, text) from public, anon;
grant execute on function public.migrate_own_device_identity_v2(uuid, text, integer, text, text, text, text, text) to authenticated;
