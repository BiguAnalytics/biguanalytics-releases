alter table public.matches
  add column if not exists local_score integer not null default 0,
  add column if not exists rival_score integer not null default 0,
  add column if not exists bigua_score integer not null default 0,
  add column if not exists opponent_score integer not null default 0,
  add column if not exists winner_team text null,
  add column if not exists result_for_bigua text not null default 'unknown',
  add column if not exists score_updated_at timestamptz null;

alter table public.matches
  drop constraint if exists matches_local_score_non_negative,
  add constraint matches_local_score_non_negative check (local_score >= 0),
  drop constraint if exists matches_rival_score_non_negative,
  add constraint matches_rival_score_non_negative check (rival_score >= 0),
  drop constraint if exists matches_bigua_score_non_negative,
  add constraint matches_bigua_score_non_negative check (bigua_score >= 0),
  drop constraint if exists matches_opponent_score_non_negative,
  add constraint matches_opponent_score_non_negative check (opponent_score >= 0),
  drop constraint if exists matches_result_for_bigua_check,
  add constraint matches_result_for_bigua_check check (result_for_bigua in ('win', 'loss', 'draw', 'unknown'));

with point_values(event_result, points) as (
  values
    ('try', 5),
    ('conversion', 2),
    ('pk-goal', 3),
    ('drop', 3),
    ('try-penal', 7)
),
score_totals as (
  select
    e.match_id,
    coalesce(sum(case when e.team = 'home' then pv.points else 0 end), 0)::integer as local_score,
    coalesce(sum(case when e.team = 'away' then pv.points else 0 end), 0)::integer as rival_score,
    max(e.updated_at) as score_updated_at
  from public.match_events e
  join point_values pv on pv.event_result = e.result
  where e.event_type = 'points'
  group by e.match_id
)
update public.matches m
set
  local_score = greatest(0, s.local_score),
  rival_score = greatest(0, s.rival_score),
  bigua_score = case
    when lower(coalesce(m.rival_team, '')) like '%bigua%' then greatest(0, s.rival_score)
    else greatest(0, s.local_score)
  end,
  opponent_score = case
    when lower(coalesce(m.rival_team, '')) like '%bigua%' then greatest(0, s.local_score)
    else greatest(0, s.rival_score)
  end,
  winner_team = case
    when s.local_score = s.rival_score then 'Empate'
    when s.local_score > s.rival_score then m.local_team
    else m.rival_team
  end,
  result_for_bigua = case
    when s.local_score = s.rival_score then 'draw'
    when lower(coalesce(m.rival_team, '')) like '%bigua%' and s.rival_score > s.local_score then 'win'
    when lower(coalesce(m.rival_team, '')) like '%bigua%' and s.rival_score < s.local_score then 'loss'
    when lower(coalesce(m.rival_team, '')) not like '%bigua%' and s.local_score > s.rival_score then 'win'
    when lower(coalesce(m.rival_team, '')) not like '%bigua%' and s.local_score < s.rival_score then 'loss'
    else 'unknown'
  end,
  score_updated_at = coalesce(s.score_updated_at, m.score_updated_at, now()),
  updated_at = greatest(m.updated_at, coalesce(s.score_updated_at, m.updated_at))
from score_totals s
where m.id = s.match_id;

create index if not exists matches_club_score_updated_idx on public.matches (club_id, score_updated_at desc);
