comment on table public.matches is
  'Lightweight cloud sync root. Home and match loaders use club-level visibility through RLS; created_by is audit metadata and must not hide matches from approved users in the same club.';

comment on column public.matches.club_id is
  'Club visibility boundary for lightweight match sync.';

comment on column public.matches.created_by is
  'Creator audit field. Do not use this as a read visibility boundary for club members.';

comment on policy "matches read active club" on public.matches is
  'Read access is club-level visibility gated by public.is_active_club_member(matches.club_id), not by created_by.';

comment on policy "match events read active club" on public.match_events is
  'Read access follows match_events.club_id for approved same-club users and approved devices.';

comment on policy "match possessions read active club" on public.match_possessions is
  'Read access follows match_possessions.club_id for approved same-club users and approved devices.';

comment on policy "match sequences read active club" on public.match_sequences is
  'Read access follows match_sequences.club_id for approved same-club users and approved devices.';

comment on policy "match notes read active club" on public.match_notes is
  'Read access follows match_notes.club_id for approved same-club users and approved devices.';

create index if not exists match_events_club_match_updated_idx
  on public.match_events (club_id, match_id, updated_at desc);

create index if not exists match_possessions_club_match_start_idx
  on public.match_possessions (club_id, match_id, start_ms);

create index if not exists match_sequences_club_match_start_idx
  on public.match_sequences (club_id, match_id, start_ms);

create index if not exists match_notes_club_match_updated_idx
  on public.match_notes (club_id, match_id, updated_at desc);
