-- Prompt 80 — Email deliverability: warm-up logs, prefs, campaign spam/health columns.
-- Run in Supabase SQL Editor after campaigns.sql.

-- Optional columns on persisted campaigns (nullable = backward-compatible).
alter table public.campaigns
  add column if not exists spam_score smallint;

alter table public.campaigns
  add column if not exists deliverability_status text;

comment on column public.campaigns.spam_score is 'Prompt 80: inbox health 0–100 (higher = better) at last outreach send.';
comment on column public.campaigns.deliverability_status is 'Prompt 80: excellent | good | fair | poor — derived from spam/heuristic check.';

-- Per-user warm-up toggle.
create table if not exists public.user_deliverability_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  warmup_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_deliverability_prefs enable row level security;

grant select, insert, update, delete on public.user_deliverability_prefs to authenticated;

create policy "Users manage own deliverability prefs"
  on public.user_deliverability_prefs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.user_deliverability_prefs is 'Prompt 80: warm-up feature toggle per user.';

-- Daily warm-up volume + synthetic placement score for dashboard charts.
create table if not exists public.email_warmup_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  emails_sent integer not null default 0,
  inbox_placement_score integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, log_date),
  constraint email_warmup_emails_sent_range check (emails_sent >= 0 and emails_sent <= 500),
  constraint email_warmup_placement_range check (
    inbox_placement_score >= 0 and inbox_placement_score <= 100
  )
);

create index if not exists email_warmup_logs_user_date_idx
  on public.email_warmup_logs (user_id, log_date desc);

alter table public.email_warmup_logs enable row level security;

grant select, insert, update, delete on public.email_warmup_logs to authenticated;

create policy "Users manage own warm-up logs"
  on public.email_warmup_logs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.email_warmup_logs is 'Prompt 80: daily warm-up sends + inbox placement score for reseller dashboards.';
