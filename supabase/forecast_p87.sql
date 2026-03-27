-- Prompt 87 — Revenue forecasting: optional cached columns on persisted campaigns.
-- Run in Supabase SQL Editor after public.campaigns exists.

alter table public.campaigns
  add column if not exists predicted_revenue numeric;

alter table public.campaigns
  add column if not exists win_probability numeric;

comment on column public.campaigns.predicted_revenue is
  'Prompt 87: Heuristic USD deal size from composite + qualification (see lib/forecast.ts).';

comment on column public.campaigns.win_probability is
  'Prompt 87: Heuristic close probability 0–100; mirrored from forecast engine on save.';
