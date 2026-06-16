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
  );
$$;

revoke all on function public.is_active_club_member(uuid) from public, anon;
grant execute on function public.is_active_club_member(uuid) to authenticated;

drop policy if exists "matches read own club" on public.matches;
drop policy if exists "matches insert own club" on public.matches;
drop policy if exists "matches update own club" on public.matches;
drop policy if exists "matches delete own club" on public.matches;
drop policy if exists "matches read active club" on public.matches;
drop policy if exists "matches insert active club" on public.matches;
drop policy if exists "matches update active club" on public.matches;
drop policy if exists "matches delete active club" on public.matches;

create policy "matches read active club"
on public.matches
for select
to authenticated
using (public.is_active_club_member(matches.club_id));

create policy "matches insert active club"
on public.matches
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_active_club_member(matches.club_id)
);

create policy "matches update active club"
on public.matches
for update
to authenticated
using (public.is_active_club_member(matches.club_id))
with check (public.is_active_club_member(matches.club_id));

create policy "matches delete active club"
on public.matches
for delete
to authenticated
using (public.is_active_club_member(matches.club_id));

drop policy if exists "video references own club" on public.video_references;
drop policy if exists "video references active club" on public.video_references;

create policy "video references active club"
on public.video_references
for all
to authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = video_references.match_id
      and public.is_active_club_member(m.club_id)
  )
)
with check (
  exists (
    select 1
    from public.matches m
    where m.id = video_references.match_id
      and public.is_active_club_member(m.club_id)
  )
);

drop policy if exists "match events own club" on public.match_events;
drop policy if exists "match events update own club" on public.match_events;
drop policy if exists "match events read active club" on public.match_events;
drop policy if exists "match events insert active club" on public.match_events;
drop policy if exists "match events update active club" on public.match_events;
drop policy if exists "match events delete active club" on public.match_events;

create policy "match events read active club"
on public.match_events
for select
to authenticated
using (public.is_active_club_member(match_events.club_id));

create policy "match events insert active club"
on public.match_events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_active_club_member(match_events.club_id)
  and exists (
    select 1
    from public.matches m
    where m.id = match_events.match_id
      and m.club_id = match_events.club_id
  )
);

create policy "match events update active club"
on public.match_events
for update
to authenticated
using (public.is_active_club_member(match_events.club_id))
with check (
  public.is_active_club_member(match_events.club_id)
  and exists (
    select 1
    from public.matches m
    where m.id = match_events.match_id
      and m.club_id = match_events.club_id
  )
);

create policy "match events delete active club"
on public.match_events
for delete
to authenticated
using (public.is_active_club_member(match_events.club_id));

drop policy if exists "match possessions own club" on public.match_possessions;
drop policy if exists "match possessions update own club" on public.match_possessions;
drop policy if exists "match possessions read active club" on public.match_possessions;
drop policy if exists "match possessions insert active club" on public.match_possessions;
drop policy if exists "match possessions update active club" on public.match_possessions;
drop policy if exists "match possessions delete active club" on public.match_possessions;

create policy "match possessions read active club"
on public.match_possessions
for select
to authenticated
using (public.is_active_club_member(match_possessions.club_id));

create policy "match possessions insert active club"
on public.match_possessions
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_active_club_member(match_possessions.club_id)
  and exists (
    select 1
    from public.matches m
    where m.id = match_possessions.match_id
      and m.club_id = match_possessions.club_id
  )
);

create policy "match possessions update active club"
on public.match_possessions
for update
to authenticated
using (public.is_active_club_member(match_possessions.club_id))
with check (
  public.is_active_club_member(match_possessions.club_id)
  and exists (
    select 1
    from public.matches m
    where m.id = match_possessions.match_id
      and m.club_id = match_possessions.club_id
  )
);

create policy "match possessions delete active club"
on public.match_possessions
for delete
to authenticated
using (public.is_active_club_member(match_possessions.club_id));

drop policy if exists "match sequences own club" on public.match_sequences;
drop policy if exists "match sequences update own club" on public.match_sequences;
drop policy if exists "match sequences read active club" on public.match_sequences;
drop policy if exists "match sequences insert active club" on public.match_sequences;
drop policy if exists "match sequences update active club" on public.match_sequences;
drop policy if exists "match sequences delete active club" on public.match_sequences;

create policy "match sequences read active club"
on public.match_sequences
for select
to authenticated
using (public.is_active_club_member(match_sequences.club_id));

create policy "match sequences insert active club"
on public.match_sequences
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_active_club_member(match_sequences.club_id)
  and exists (
    select 1
    from public.matches m
    where m.id = match_sequences.match_id
      and m.club_id = match_sequences.club_id
  )
);

create policy "match sequences update active club"
on public.match_sequences
for update
to authenticated
using (public.is_active_club_member(match_sequences.club_id))
with check (
  public.is_active_club_member(match_sequences.club_id)
  and exists (
    select 1
    from public.matches m
    where m.id = match_sequences.match_id
      and m.club_id = match_sequences.club_id
  )
);

create policy "match sequences delete active club"
on public.match_sequences
for delete
to authenticated
using (public.is_active_club_member(match_sequences.club_id));

drop policy if exists "match notes own club" on public.match_notes;
drop policy if exists "match notes update own club" on public.match_notes;
drop policy if exists "match notes read active club" on public.match_notes;
drop policy if exists "match notes insert active club" on public.match_notes;
drop policy if exists "match notes update active club" on public.match_notes;
drop policy if exists "match notes delete active club" on public.match_notes;

create policy "match notes read active club"
on public.match_notes
for select
to authenticated
using (public.is_active_club_member(match_notes.club_id));

create policy "match notes insert active club"
on public.match_notes
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.is_active_club_member(match_notes.club_id)
  and exists (
    select 1
    from public.matches m
    where m.id = match_notes.match_id
      and m.club_id = match_notes.club_id
  )
);

create policy "match notes update active club"
on public.match_notes
for update
to authenticated
using (public.is_active_club_member(match_notes.club_id))
with check (
  public.is_active_club_member(match_notes.club_id)
  and exists (
    select 1
    from public.matches m
    where m.id = match_notes.match_id
      and m.club_id = match_notes.club_id
  )
);

create policy "match notes delete active club"
on public.match_notes
for delete
to authenticated
using (public.is_active_club_member(match_notes.club_id));
