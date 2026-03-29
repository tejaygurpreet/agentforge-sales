-- Smart lead scoring & auto-prioritization (cached on campaign save).
-- Run in Supabase SQL Editor after `public.campaigns` exists.
-- Leaderboard in the app recomputes from `results` + reply analyses; these columns cache the
-- last snapshot-only score for SQL/reporting and Recent campaigns badges.

alter table public.campaigns
  add column if not exists lead_score jsonb;

alter table public.campaigns
  add column if not exists priority_reason text;

comment on column public.campaigns.lead_score is
  'JSON: icp_fit, intent_signals, reply_probability, deal_value_potential, composite (0–100), tier (critical|high|medium|low).';

comment on column public.campaigns.priority_reason is
  'Short template rationale for queue order (deterministic from signals).';
