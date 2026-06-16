alter table public.profiles
  add column if not exists display_name text null;

create or replace function public.build_profile_display_name(
  p_first_name text,
  p_last_name text
)
returns text
language sql
immutable
as $$
  select nullif(
    trim(concat_ws(
      ' ',
      nullif(trim(coalesce(p_first_name, '')), ''),
      case
        when nullif(trim(coalesce(p_last_name, '')), '') is null then null
        else upper(left(trim(p_last_name), 1)) || '.'
      end
    )),
    ''
  )
$$;

create or replace function public.set_profile_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.first_name = nullif(trim(coalesce(new.first_name, '')), '');
  new.last_name = nullif(trim(coalesce(new.last_name, '')), '');
  new.app_role = nullif(lower(trim(coalesce(new.app_role, ''))), '');

  if new.app_role = 'jugador' then
    new.position = nullif(lower(trim(coalesce(new.position, ''))), '');
    new.is_player = true;
  elsif new.app_role in ('entrenador', 'analista', 'staff', 'otro') then
    new.position = null;
    new.is_player = false;
  else
    new.position = nullif(lower(trim(coalesce(new.position, ''))), '');
  end if;

  new.display_name = public.build_profile_display_name(new.first_name, new.last_name);
  return new;
end;
$$;

drop trigger if exists profiles_set_profile_display_name on public.profiles;
create trigger profiles_set_profile_display_name
before insert or update of first_name, last_name, app_role, is_player, position, display_name
on public.profiles
for each row execute function public.set_profile_display_name();

update public.profiles
set display_name = public.build_profile_display_name(first_name, last_name)
where display_name is null
  and nullif(trim(coalesce(first_name, '')), '') is not null;

alter table public.profiles
  drop constraint if exists profiles_app_role_visible_check,
  drop constraint if exists profiles_player_position_visible_check,
  drop constraint if exists profiles_player_position_required_check,
  drop constraint if exists profiles_visible_role_player_flag_check;

alter table public.profiles
  add constraint profiles_app_role_visible_check
    check (app_role is null or app_role in ('jugador', 'entrenador', 'analista', 'staff', 'otro')) not valid,
  add constraint profiles_player_position_visible_check
    check (position is null or position in ('pilar', 'hooker', 'segunda_linea', 'ala', 'octavo', 'medio_scrum', 'apertura', 'centro', 'wing', 'fullback', 'otro')) not valid,
  add constraint profiles_player_position_required_check
    check (app_role is distinct from 'jugador' or position is not null) not valid,
  add constraint profiles_visible_role_player_flag_check
    check (app_role is null or is_player = (app_role = 'jugador')) not valid;
