-- Prompt 96 — Optional denormalized competitor battle-card payload for analytics / SQL queries.
-- Full research (including competitor_landscape) remains in campaigns.results jsonb for backward compatibility.

alter table public.campaigns add column if not exists competitor_analysis jsonb;

comment on column public.campaigns.competitor_analysis is
  'Prompt 96: structured competitor landscape { account_positioning, competitors[] } — mirrors research_output.competitor_landscape when present; optional; full snapshot still in results.';
