-- Prompt 94 — AI Campaign Optimizer: persisted status + metrics (optional; save-campaign omits if missing).
-- Run in Supabase SQL editor after prior campaign migrations.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS optimization_status text;

COMMENT ON COLUMN public.campaigns.optimization_status IS
  'Prompt 94: AI optimizer status label (e.g. healthy, at_risk, auto_pause_suggested, variant_switch_suggested).';

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS performance_metrics jsonb;

COMMENT ON COLUMN public.campaigns.performance_metrics IS
  'Prompt 94: JSON snapshot of CampaignPerformanceMetrics (reply proxy, interest, meeting signal, composite health).';
