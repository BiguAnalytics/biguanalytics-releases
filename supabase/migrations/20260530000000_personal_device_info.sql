alter table public.profiles
  add column if not exists first_name text null,
  add column if not exists last_name text null,
  add column if not exists age int null,
  add column if not exists app_role text null,
  add column if not exists is_player boolean null,
  add column if not exists position text null;

alter table public.devices
  add column if not exists owner_first_name text null,
  add column if not exists owner_last_name text null,
  add column if not exists owner_age int null,
  add column if not exists owner_role text null,
  add column if not exists owner_is_player boolean null,
  add column if not exists owner_position text null;

alter table public.profiles
  drop constraint if exists profiles_age_check,
  add constraint profiles_age_check check (age is null or (age >= 12 and age <= 100));

alter table public.devices
  drop constraint if exists devices_owner_age_check,
  add constraint devices_owner_age_check check (owner_age is null or (owner_age >= 12 and owner_age <= 100));

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

drop policy if exists "update own personal profile fields" on public.profiles;
create policy "update own personal profile fields"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());
