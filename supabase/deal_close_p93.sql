-- Prompt 93 — AI-powered deal close probability + structured qualification factors (jsonb).
-- Run in Supabase SQL editor. Safe to re-run: uses IF NOT EXISTS guards.

alter table public.campaigns
  add column if not exists close_probability integer;

comment on column public.campaigns.close_probability is
  'Prompt 93 — estimated win likelihood 0–100 from qualification-engine (optional).';

alter table public.campaigns
  add column if not exists qualification_factors jsonb;

comment on column public.campaigns.qualification_factors is
  'Prompt 93 — json { engine_version, confidence, factors[], suggested_actions[] } — distinct from detected_objections (Prompt 92).';

create index if not exists campaigns_close_probability_idx
  on public.campaigns (close_probability desc nulls last)
  where close_probability is not null;
