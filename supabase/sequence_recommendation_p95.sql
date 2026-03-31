-- Prompt 95 — Intelligent Sequence Recommendation: optional campaign JSON + audit log.
-- Run in Supabase SQL editor after prior migrations.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS sequence_recommendation jsonb;

COMMENT ON COLUMN public.campaigns.sequence_recommendation IS
  'Prompt 95: SequenceRecommendationSnapshot (voice, sequence id, confidence, hints) when a run included recommendation metadata.';

CREATE TABLE IF NOT EXISTS public.sequence_recommendation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  company text,
  prospect_email text,
  recommended_sequence_id uuid,
  confidence numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sequence_recommendation_log_workspace_created_idx
  ON public.sequence_recommendation_log (workspace_id, created_at DESC);

COMMENT ON TABLE public.sequence_recommendation_log IS
  'Prompt 95: audit trail when a campaign run includes sequence_recommendation_snapshot (best-effort insert).';
