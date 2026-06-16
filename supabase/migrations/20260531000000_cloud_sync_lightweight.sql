create extension if not exists pgcrypto;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  local_team text not null,
  rival_team text not null,
  match_date date not null,
  competition text null,
  venue text null,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_status_check check (status in ('created', 'tagging', 'analyzed', 'archived')),
  constraint matches_venue_check check (venue is null or venue in ('home', 'away'))
);

create table if not exists public.video_references (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  source_type text not null,
  youtube_url text null,
  youtube_video_id text null,
  local_file_name text null,
  local_file_size bigint null,
  local_duration_ms integer null,
  local_fingerprint_hash text null,
  start_offset_ms integer not null default 0,
  created_at timestamptz not null default now(),
  constraint video_references_match_unique unique (match_id),
  constraint video_references_source_type_check check (source_type in ('youtube', 'local_mp4')),
  constraint video_references_offset_check check (start_offset_ms >= 0),
  constraint video_references_local_size_check check (local_file_size is null or local_file_size >= 0),
  constraint video_references_local_duration_check check (local_duration_ms is null or local_duration_ms >= 0),
  constraint video_references_local_hash_check check (local_fingerprint_hash is null or local_fingerprint_hash ~ '^[a-f0-9]{64}$'),
  constraint video_references_payload_check check (
    (source_type = 'youtube' and youtube_url is not null and youtube_video_id is not null)
    or
    (source_type = 'local_mp4' and local_file_name is not null)
  )
);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  timestamp_ms integer null,
  event_type text not null,
  team text null,
  result text null,
  subtype text null,
  zone text null,
  note text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_events_timestamp_check check (timestamp_ms is null or timestamp_ms >= 0),
  constraint match_events_team_check check (team is null or team in ('home', 'away'))
);

create table if not exists public.match_possessions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  team text not null,
  start_ms integer not null,
  end_ms integer not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  constraint match_possessions_team_check check (team in ('home', 'away')),
  constraint match_possessions_range_check check (start_ms >= 0 and end_ms >= start_ms)
);

create table if not exists public.match_sequences (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  start_ms integer not null,
  end_ms integer not null,
  team text null,
  result text null,
  phases_count integer not null default 0,
  start_zone text null,
  end_zone text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  constraint match_sequences_team_check check (team is null or team in ('home', 'away')),
  constraint match_sequences_range_check check (start_ms >= 0 and end_ms >= start_ms),
  constraint match_sequences_phases_check check (phases_count >= 0)
);

create table if not exists public.match_notes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists matches_club_updated_idx on public.matches (club_id, updated_at desc);
create index if not exists match_events_match_timestamp_idx on public.match_events (match_id, timestamp_ms);
create index if not exists match_possessions_match_start_idx on public.match_possessions (match_id, start_ms);
create index if not exists match_sequences_match_start_idx on public.match_sequences (match_id, start_ms);
create index if not exists match_notes_match_updated_idx on public.match_notes (match_id, updated_at desc);

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

drop trigger if exists match_events_set_updated_at on public.match_events;
create trigger match_events_set_updated_at
before update on public.match_events
for each row execute function public.set_updated_at();

drop trigger if exists match_notes_set_updated_at on public.match_notes;
create trigger match_notes_set_updated_at
before update on public.match_notes
for each row execute function public.set_updated_at();

alter table public.matches enable row level security;
alter table public.video_references enable row level security;
alter table public.match_events enable row level security;
alter table public.match_possessions enable row level security;
alter table public.match_sequences enable row level security;
alter table public.match_notes enable row level security;

drop policy if exists "matches read own club" on public.matches;
create policy "matches read own club"
on public.matches
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = matches.club_id
  )
);

drop policy if exists "matches insert own club" on public.matches;
create policy "matches insert own club"
on public.matches
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = matches.club_id
  )
);

drop policy if exists "matches update own club" on public.matches;
create policy "matches update own club"
on public.matches
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = matches.club_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = matches.club_id
  )
);

drop policy if exists "matches delete own club" on public.matches;
create policy "matches delete own club"
on public.matches
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = matches.club_id
  )
);

drop policy if exists "video references own club" on public.video_references;
create policy "video references own club"
on public.video_references
for all
to authenticated
using (
  exists (
    select 1
    from public.matches m
    join public.profiles p on p.id = auth.uid()
    where m.id = video_references.match_id
      and p.club_id = m.club_id
  )
)
with check (
  exists (
    select 1
    from public.matches m
    join public.profiles p on p.id = auth.uid()
    where m.id = video_references.match_id
      and p.club_id = m.club_id
  )
);

drop policy if exists "match events own club" on public.match_events;
create policy "match events own club"
on public.match_events
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = match_events.club_id
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.matches m
    join public.profiles p on p.id = auth.uid()
    where m.id = match_events.match_id
      and p.club_id = match_events.club_id
      and m.club_id = match_events.club_id
  )
);

drop policy if exists "match events update own club" on public.match_events;
create policy "match events update own club"
on public.match_events
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = match_events.club_id
  )
)
with check (
  exists (
    select 1 from public.matches m
    join public.profiles p on p.id = auth.uid()
    where m.id = match_events.match_id
      and p.club_id = match_events.club_id
      and m.club_id = match_events.club_id
  )
);

drop policy if exists "match possessions own club" on public.match_possessions;
create policy "match possessions own club"
on public.match_possessions
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = match_possessions.club_id
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.matches m
    join public.profiles p on p.id = auth.uid()
    where m.id = match_possessions.match_id
      and p.club_id = match_possessions.club_id
      and m.club_id = match_possessions.club_id
  )
);

drop policy if exists "match possessions update own club" on public.match_possessions;
create policy "match possessions update own club"
on public.match_possessions
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = match_possessions.club_id
  )
)
with check (
  exists (
    select 1 from public.matches m
    join public.profiles p on p.id = auth.uid()
    where m.id = match_possessions.match_id
      and p.club_id = match_possessions.club_id
      and m.club_id = match_possessions.club_id
  )
);

drop policy if exists "match sequences own club" on public.match_sequences;
create policy "match sequences own club"
on public.match_sequences
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = match_sequences.club_id
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.matches m
    join public.profiles p on p.id = auth.uid()
    where m.id = match_sequences.match_id
      and p.club_id = match_sequences.club_id
      and m.club_id = match_sequences.club_id
  )
);

drop policy if exists "match sequences update own club" on public.match_sequences;
create policy "match sequences update own club"
on public.match_sequences
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = match_sequences.club_id
  )
)
with check (
  exists (
    select 1 from public.matches m
    join public.profiles p on p.id = auth.uid()
    where m.id = match_sequences.match_id
      and p.club_id = match_sequences.club_id
      and m.club_id = match_sequences.club_id
  )
);

drop policy if exists "match notes own club" on public.match_notes;
create policy "match notes own club"
on public.match_notes
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = match_notes.club_id
  )
)
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.matches m
    join public.profiles p on p.id = auth.uid()
    where m.id = match_notes.match_id
      and p.club_id = match_notes.club_id
      and m.club_id = match_notes.club_id
  )
);

drop policy if exists "match notes update own club" on public.match_notes;
create policy "match notes update own club"
on public.match_notes
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.club_id = match_notes.club_id
  )
)
with check (
  exists (
    select 1 from public.matches m
    join public.profiles p on p.id = auth.uid()
    where m.id = match_notes.match_id
      and p.club_id = match_notes.club_id
      and m.club_id = match_notes.club_id
  )
);
