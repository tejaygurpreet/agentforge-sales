-- Run in Supabase SQL Editor (or via migration) before relying on campaign persistence.
-- Creates the campaigns table for AgentForge Sales dashboard history.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id text not null,
  lead_name text not null,
  company text not null,
  email text not null,
  status text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  results jsonb not null default '{}'::jsonb
);

create unique index if not exists campaigns_thread_id_key on public.campaigns (thread_id);
create index if not exists campaigns_user_created_idx on public.campaigns (user_id, created_at desc);

alter table public.campaigns enable row level security;

-- Let the dashboard read rows with the user JWT (listRecentCampaigns).
grant usage on schema public to authenticated;
grant select on table public.campaigns to authenticated;

-- Authenticated users can read their own rows (optional if you only use service role from the app).
create policy "Users read own campaigns"
  on public.campaigns
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts are performed with the service role from the Next.js server (bypasses RLS).
-- If you insert with the anon key later, add an insert policy scoped to auth.uid().

comment on table public.campaigns is 'AgentForge Sales persisted campaign runs (snapshot JSON per thread).';
