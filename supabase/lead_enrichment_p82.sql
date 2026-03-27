-- Prompt 82 — Built-in lead enrichment (Tavily / Browserless structured JSON).
-- Run in Supabase SQL Editor after campaigns.sql (and optional email_deliverability.sql).
-- Safe to run multiple times (IF NOT EXISTS).

alter table public.campaigns
  add column if not exists enriched_data jsonb;

comment on column public.campaigns.enriched_data is
  'Prompt 82: optional structured lead enrichment (company, funding, hiring, tech, intent) — backward-compatible when null.';
