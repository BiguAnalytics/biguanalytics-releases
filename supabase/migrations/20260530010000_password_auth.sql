alter table public.profiles
  add column if not exists password_configured boolean not null default false,
  add column if not exists password_configured_at timestamptz null;

-- Passwords are stored only by Supabase Auth. These columns are UX metadata
-- used by the Electron client to know whether to show the password setup screen.
comment on column public.profiles.password_configured is
  'True after supabase.auth.updateUser({ password }) succeeds. Never stores passwords.';

comment on column public.profiles.password_configured_at is
  'Timestamp set after supabase.auth.updateUser({ password }) succeeds. Never stores passwords.';

create or replace function public.prevent_profile_privilege_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = new.id then
    if new.email is distinct from old.email
      or new.club_id is distinct from old.club_id
      or new.role is distinct from old.role
      or new.status is distinct from old.status then
      raise exception 'profile_privilege_fields_are_read_only';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_update on public.profiles;
create trigger profiles_prevent_privilege_update
before update on public.profiles
for each row execute function public.prevent_profile_privilege_update();

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
