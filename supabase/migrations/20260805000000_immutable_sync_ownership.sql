create or replace function public.prevent_sync_ownership_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if TG_OP <> 'UPDATE' then
    return NEW;
  end if;

  if TG_TABLE_NAME in ('matches', 'match_events', 'match_possessions', 'match_sequences') then
    if (to_jsonb(OLD) ->> 'created_by') is distinct from (to_jsonb(NEW) ->> 'created_by') then
      raise exception 'created_by is immutable after creation';
    end if;
    if (to_jsonb(OLD) ->> 'club_id') is distinct from (to_jsonb(NEW) ->> 'club_id') then
      raise exception 'club_id is immutable after creation';
    end if;
  elsif TG_TABLE_NAME = 'match_notes' then
    if (to_jsonb(OLD) ->> 'author_id') is distinct from (to_jsonb(NEW) ->> 'author_id') then
      raise exception 'author_id is immutable after creation';
    end if;
    if (to_jsonb(OLD) ->> 'club_id') is distinct from (to_jsonb(NEW) ->> 'club_id') then
      raise exception 'club_id is immutable after creation';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists matches_immutable_ownership on public.matches;
create trigger matches_immutable_ownership
before update of created_by, club_id on public.matches
for each row execute function public.prevent_sync_ownership_changes();

drop trigger if exists match_events_immutable_ownership on public.match_events;
create trigger match_events_immutable_ownership
before update of created_by, club_id on public.match_events
for each row execute function public.prevent_sync_ownership_changes();

drop trigger if exists match_possessions_immutable_ownership on public.match_possessions;
create trigger match_possessions_immutable_ownership
before update of created_by, club_id on public.match_possessions
for each row execute function public.prevent_sync_ownership_changes();

drop trigger if exists match_sequences_immutable_ownership on public.match_sequences;
create trigger match_sequences_immutable_ownership
before update of created_by, club_id on public.match_sequences
for each row execute function public.prevent_sync_ownership_changes();

drop trigger if exists match_notes_immutable_ownership on public.match_notes;
create trigger match_notes_immutable_ownership
before update of author_id, club_id on public.match_notes
for each row execute function public.prevent_sync_ownership_changes();
