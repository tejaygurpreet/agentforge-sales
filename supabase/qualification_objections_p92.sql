-- Prompt 92 — Intelligent lead qualification scoring + detected objections (jsonb).
-- Run in Supabase SQL editor. Safe to re-run: uses IF NOT EXISTS guards where applicable.

alter table public.campaigns
  add column if not exists qualification_score integer;

comment on column public.campaigns.qualification_score is
  'Prompt 92 — pipeline qualification score 0–100 (cached from campaign snapshot; optional).';

alter table public.campaigns
  add column if not exists detected_objections jsonb;

comment on column public.campaigns.detected_objections is
  'Prompt 92 — jsonb array of objection entries from qualification (source, text, patterns, coach_headline).';

create index if not exists campaigns_qualification_score_idx
  on public.campaigns (qualification_score desc nulls last)
  where qualification_score is not null;
