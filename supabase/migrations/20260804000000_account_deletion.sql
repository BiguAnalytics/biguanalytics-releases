-- Account deletion is intentionally scoped to auth.uid().
-- Shared club match data remains available; only author attribution is removed.

alter table public.license_checks
  drop constraint if exists license_checks_user_id_fkey,
  drop constraint if exists license_checks_device_id_fkey;

alter table public.matches
  alter column created_by drop not null,
  drop constraint if exists matches_created_by_fkey;

alter table public.match_events
  alter column created_by drop not null,
  drop constraint if exists match_events_created_by_fkey;

alter table public.match_possessions
  alter column created_by drop not null,
  drop constraint if exists match_possessions_created_by_fkey;

alter table public.match_sequences
  alter column created_by drop not null,
  drop constraint if exists match_sequences_created_by_fkey;

alter table public.match_notes
  alter column author_id drop not null,
  drop constraint if exists match_notes_author_id_fkey;

alter table public.license_checks
  add constraint license_checks_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null,
  add constraint license_checks_device_id_fkey
    foreign key (device_id) references public.devices(id) on delete set null;

alter table public.matches
  add constraint matches_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.match_events
  add constraint match_events_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.match_possessions
  add constraint match_possessions_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.match_sequences
  add constraint match_sequences_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.match_notes
  add constraint match_notes_author_id_fkey
    foreign key (author_id) references auth.users(id) on delete set null;

create or replace function public.delete_own_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := auth.uid();
  deleted_user_id uuid;
begin
  if target_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Serialize repeated clicks, retries and multiple windows for this account.
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  update public.matches
  set created_by = null
  where created_by = target_user_id;

  update public.match_events
  set created_by = null
  where created_by = target_user_id;

  update public.match_possessions
  set created_by = null
  where created_by = target_user_id;

  update public.match_sequences
  set created_by = null
  where created_by = target_user_id;

  update public.match_notes
  set author_id = null
  where author_id = target_user_id;

  update public.license_checks
  set user_id = null
  where user_id = target_user_id;

  update public.license_checks
  set device_id = null
  where device_id in (
    select id from public.devices where user_id = target_user_id
  );

  delete from auth.users
  where id = target_user_id
  returning id into deleted_user_id;

  if deleted_user_id is null then
    raise exception 'account_not_found';
  end if;

  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
