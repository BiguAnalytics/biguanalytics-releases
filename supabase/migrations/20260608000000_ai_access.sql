create table if not exists public.ai_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  daily_limit integer not null default 30,
  role text null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null,
  constraint ai_access_daily_limit_check check (daily_limit > 0)
);

alter table public.ai_access enable row level security;

drop policy if exists "ai access read own row" on public.ai_access;
create policy "ai access read own row"
on public.ai_access
for select
to authenticated
using (auth.uid() = user_id);

create index if not exists ai_access_enabled_idx
on public.ai_access (enabled)
where revoked_at is null;
