-- Prompt 99 — AI deliverability coach cache + health snapshots (extends Prompt 80).
-- Run after supabase/email_deliverability.sql.

alter table public.user_deliverability_prefs
  add column if not exists deliverability_health_score smallint;

alter table public.user_deliverability_prefs
  add column if not exists last_coach_json jsonb not null default '{}'::jsonb;

alter table public.user_deliverability_prefs
  add column if not exists next_suggested_send_at timestamptz;

alter table public.user_deliverability_prefs
  add column if not exists last_coach_at timestamptz;

comment on column public.user_deliverability_prefs.deliverability_health_score is
  'Prompt 99: cached composite 0–100 from coach (warm-up + placement heuristics).';

comment on column public.user_deliverability_prefs.last_coach_json is
  'Prompt 99: last AI coach payload { suggestions[], subject_ideas[], cached_at }';

comment on column public.user_deliverability_prefs.next_suggested_send_at is
  'Prompt 99: suggested next warm-up log window (informational — does not send mail).';

comment on column public.user_deliverability_prefs.last_coach_at is
  'Prompt 99: when refreshDeliverabilityCoachAction last succeeded.';

alter table public.email_warmup_logs
  add column if not exists schedule_tag text;

comment on column public.email_warmup_logs.schedule_tag is
  'Prompt 99: optional slot label (e.g. morning_slot_1) for smart scheduling UI.';

create table if not exists public.deliverability_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recorded_at timestamptz not null default now(),
  composite_health smallint not null,
  placement_prediction smallint not null,
  coaching_json jsonb not null default '{}'::jsonb
);

create index if not exists deliverability_health_snapshots_user_idx
  on public.deliverability_health_snapshots (user_id, recorded_at desc);

comment on table public.deliverability_health_snapshots is
  'Prompt 99: historical coach scores + AI suggestions for trend charts.';

alter table public.deliverability_health_snapshots enable row level security;

grant select, insert, delete on public.deliverability_health_snapshots to authenticated;

create policy "Users read own deliverability health snapshots"
  on public.deliverability_health_snapshots
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own deliverability health snapshots"
  on public.deliverability_health_snapshots
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users delete own deliverability health snapshots"
  on public.deliverability_health_snapshots
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.deliverability_health_snapshots to service_role;
