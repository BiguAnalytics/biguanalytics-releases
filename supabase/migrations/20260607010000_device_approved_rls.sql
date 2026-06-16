create or replace function public.request_device_fingerprint_hash()
returns text
language sql
stable
security invoker
set search_path = public
as $$
  with headers as (
    select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb as value
  ),
  fingerprint as (
    select lower(coalesce(
      headers.value ->> 'x-bigu-device-fingerprint',
      headers.value ->> 'X-Bigu-Device-Fingerprint',
      ''
    )) as value
    from headers
  )
  select case
    when fingerprint.value ~ '^[a-f0-9]{64}$' then fingerprint.value
    else ''
  end
  from fingerprint;
$$;

revoke all on function public.request_device_fingerprint_hash() from public, anon;
grant execute on function public.request_device_fingerprint_hash() to authenticated;

create or replace function public.has_approved_request_device(p_club_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.devices d
    where d.club_id = p_club_id
      and d.user_id = auth.uid()
      and d.status = 'approved'
      and d.fingerprint_hash = public.request_device_fingerprint_hash()
  );
$$;

revoke all on function public.has_approved_request_device(uuid) from public, anon;
grant execute on function public.has_approved_request_device(uuid) to authenticated;

create or replace function public.is_active_club_member(p_club_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.clubs c on c.id = p.club_id
    where p.id = auth.uid()
      and p.club_id = p_club_id
      and p.status = 'approved'
      and c.license_status in ('trial', 'active')
      and (c.expires_at is null or c.expires_at > now())
      and public.has_approved_request_device(p_club_id)
  );
$$;

revoke all on function public.is_active_club_member(uuid) from public, anon;
grant execute on function public.is_active_club_member(uuid) to authenticated;
