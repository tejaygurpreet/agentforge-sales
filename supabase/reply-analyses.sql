-- Run in Supabase SQL Editor after campaigns.sql (Prompt 50 + 52).
-- Stores each Paste Reply analysis for the signed-in user.

create table if not exists public.reply_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id text,
  company text,
  lead_name text,
  prospect_email text,
  reply_preview text not null,
  reply_full text not null,
  analysis jsonb not null default '{}'::jsonb,
  sentiment text,
  interest_score integer,
  suggested_voice text,
  next_step text,
  objections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reply_analyses_user_created_idx
  on public.reply_analyses (user_id, created_at desc);

create index if not exists reply_analyses_thread_idx
  on public.reply_analyses (user_id, thread_id)
  where thread_id is not null;

alter table public.reply_analyses enable row level security;

grant usage on schema public to authenticated;
grant select, insert on table public.reply_analyses to authenticated;

create policy "Users read own reply analyses"
  on public.reply_analyses
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own reply analyses"
  on public.reply_analyses
  for insert
  to authenticated
  with check (auth.uid() = user_id);

comment on table public.reply_analyses is 'AgentForge Sales prospect reply analyses (Paste Reply panel).';
