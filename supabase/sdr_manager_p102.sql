-- Prompt 102 — AI SDR Manager executive cache + system health snapshot (extends public.profiles).
-- Run after supabase/coaching_p101.sql.

alter table public.profiles
  add column if not exists executive_metrics jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists system_health_status jsonb not null default '{}'::jsonb;

comment on column public.profiles.executive_metrics is
  'Prompt 102: KPI snapshot + last AI executive report { last_report, last_report_at, productivity_index, … }';

comment on column public.profiles.system_health_status is
  'Prompt 102: last persisted health check { overall, score, checks[], updated_at } — recomputed live in app.';
