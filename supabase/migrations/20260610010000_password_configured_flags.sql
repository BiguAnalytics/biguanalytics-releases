alter table public.profiles
  add column if not exists password_configured boolean not null default false,
  add column if not exists password_configured_at timestamptz null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'password_set_at'
  ) then
    execute $migrate$
      update public.profiles
      set
        password_configured = true,
        password_configured_at = coalesce(password_configured_at, password_set_at)
      where password_set_at is not null
        and password_configured = false
    $migrate$;
  end if;
end $$;

comment on column public.profiles.password_configured is
  'True after supabase.auth.updateUser({ password }) succeeds. Never stores passwords.';

comment on column public.profiles.password_configured_at is
  'Timestamp set after supabase.auth.updateUser({ password }) succeeds. Never stores passwords.';

drop function if exists public.mark_own_password_set(timestamptz);

create or replace function public.mark_own_password_configured(p_password_configured_at timestamptz default now())
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  update public.profiles
  set
    password_configured = true,
    password_configured_at = coalesce(p_password_configured_at, now()),
    updated_at = now()
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.mark_own_password_configured(timestamptz) from public;
grant execute on function public.mark_own_password_configured(timestamptz) to authenticated;
