alter table public.profiles
  add column if not exists status text not null default 'pending',
  add column if not exists ai_enabled boolean not null default false,
  add column if not exists ai_daily_limit integer not null default 30,
  add column if not exists ai_revoked_at timestamptz null,
  add column if not exists role text null;

alter table public.profiles
  alter column role drop not null;

alter table public.profiles
  drop constraint if exists profiles_status_check,
  drop constraint if exists profiles_role_check,
  drop constraint if exists profiles_ai_daily_limit_check;

update public.profiles
set status = 'suspended'
where status = 'blocked';

update public.profiles
set status = 'pending'
where status is null
   or status not in ('pending', 'approved', 'rejected', 'suspended');

alter table public.profiles
  add constraint profiles_status_check check (status in ('pending', 'approved', 'rejected', 'suspended')),
  add constraint profiles_role_check check (role is null or role in ('admin', 'owner', 'coach', 'analyst')),
  add constraint profiles_ai_daily_limit_check check (ai_daily_limit > 0);

do $$
begin
  if to_regclass('public.ai_access') is not null then
    update public.profiles p
    set
      ai_enabled = a.enabled,
      ai_daily_limit = greatest(coalesce(a.daily_limit, p.ai_daily_limit, 30), 1),
      ai_revoked_at = a.revoked_at,
      role = case
        when a.role in ('admin', 'owner', 'coach', 'analyst') then a.role
        else p.role
      end,
      status = case
        when a.enabled is true and p.status <> 'approved' then 'approved'
        else p.status
      end
    from public.ai_access a
    where p.id = a.user_id;

    drop table public.ai_access;
  end if;
end $$;

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
      or new.status is distinct from old.status
      or new.ai_enabled is distinct from old.ai_enabled
      or new.ai_daily_limit is distinct from old.ai_daily_limit
      or new.ai_revoked_at is distinct from old.ai_revoked_at then
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
