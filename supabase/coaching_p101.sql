-- Prompt 101 — AI sales coaching cache + weekly email opt-in (extends public.profiles).
-- Run after supabase/profiles.sql.

alter table public.profiles
  add column if not exists coaching_notes jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists performance_metrics jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists coaching_weekly_email_enabled boolean not null default false;

comment on column public.profiles.coaching_notes is
  'Prompt 101: cached AI coaching payload { tips[], focus_areas[], cached_at, engine_version }';

comment on column public.profiles.performance_metrics is
  'Prompt 101: last computed deterministic metrics snapshot for dashboards { voice_stats, momentum, … }';

comment on column public.profiles.coaching_weekly_email_enabled is
  'Prompt 101: opt-in for weekly coaching summary email (deliver via cron / Edge Function).';
