-- Run in Supabase SQL Editor (Prompt 75 — beta program signups from the dashboard).
-- One row per user (upsert from the app); RLS uses the authenticated session.

create table if not exists public.beta_signups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  company text not null,
  role text not null,
  linkedin_url text,
  motivation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_signups_user_id_key unique (user_id)
);

create index if not exists beta_signups_created_idx on public.beta_signups (created_at desc);

alter table public.beta_signups enable row level security;

grant select, insert, update on table public.beta_signups to authenticated;

create policy "Users insert own beta signup"
  on public.beta_signups
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users read own beta signup"
  on public.beta_signups
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users update own beta signup"
  on public.beta_signups
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.beta_signups is 'AgentForge Sales beta interest (dashboard form, one row per user).';
