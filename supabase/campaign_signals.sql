-- Prompt 70 — Live signals captured after research (Tavily / fallback heuristics).
-- Run in Supabase SQL editor after reviewing. RLS: users see only their rows.

create table if not exists public.campaign_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id text not null,
  signal_type text not null
    check (
      signal_type in (
        'funding',
        'hiring',
        'company_update',
        'news',
        'other'
      )
    ),
  signal_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists campaign_signals_user_created_idx
  on public.campaign_signals (user_id, created_at desc);

create index if not exists campaign_signals_thread_idx
  on public.campaign_signals (thread_id);

alter table public.campaign_signals enable row level security;

-- Authenticated users: read own signals
drop policy if exists "campaign_signals_select_own" on public.campaign_signals;
create policy "campaign_signals_select_own"
  on public.campaign_signals
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts from the app should use service role (bypasses RLS) or authenticated user:
drop policy if exists "campaign_signals_insert_own" on public.campaign_signals;
create policy "campaign_signals_insert_own"
  on public.campaign_signals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

comment on table public.campaign_signals is 'Prompt 70 — post-research live signals (funding, hiring, news) for analytics + PDF.';
