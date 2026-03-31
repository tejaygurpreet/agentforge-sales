-- Prompt 100 — Personalized demo booking + script storage (extends public.campaigns).
-- Run after core campaigns migration.

alter table public.campaigns
  add column if not exists demo_status text;

alter table public.campaigns
  add column if not exists demo_script jsonb;

alter table public.campaigns
  add column if not exists demo_outcome jsonb;

comment on column public.campaigns.demo_status is
  'Prompt 100: draft | script_ready | scheduled | completed | no_show | cancelled';

comment on column public.campaigns.demo_script is
  'Prompt 100: AI-generated personalized demo script (structured JSON from lib/demo-generator).';

comment on column public.campaigns.demo_outcome is
  'Prompt 100: booking metadata + recorded outcomes for playbook improvement (event ids, notes).';
