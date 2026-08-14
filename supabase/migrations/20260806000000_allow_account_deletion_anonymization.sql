-- Allow account deletion to remove author attribution without allowing
-- ownership to be reassigned to another user or club.

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
    if (to_jsonb(OLD) ->> 'created_by') is distinct from (to_jsonb(NEW) ->> 'created_by')
      and not (
        (to_jsonb(NEW) ->> 'created_by') is null
        and (to_jsonb(OLD) ->> 'created_by') = auth.uid()::text
      ) then
      raise exception 'created_by is immutable after creation';
    end if;
    if (to_jsonb(OLD) ->> 'club_id') is distinct from (to_jsonb(NEW) ->> 'club_id') then
      raise exception 'club_id is immutable after creation';
    end if;
  elsif TG_TABLE_NAME = 'match_notes' then
    if (to_jsonb(OLD) ->> 'author_id') is distinct from (to_jsonb(NEW) ->> 'author_id')
      and not (
        (to_jsonb(NEW) ->> 'author_id') is null
        and (to_jsonb(OLD) ->> 'author_id') = auth.uid()::text
      ) then
      raise exception 'author_id is immutable after creation';
    end if;
    if (to_jsonb(OLD) ->> 'club_id') is distinct from (to_jsonb(NEW) ->> 'club_id') then
      raise exception 'club_id is immutable after creation';
    end if;
  end if;

  return NEW;
end;
$$;
