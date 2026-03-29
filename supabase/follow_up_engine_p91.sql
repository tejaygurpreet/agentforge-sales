-- Prompt 91 — Intelligent follow-up engine: persisted timing summary + approval workflow.
-- Run in Supabase SQL Editor on existing `public.campaigns`.
-- Full plan remains in `campaigns.results` → `smart_follow_up_engine` (snapshot JSON); these columns
-- enable lightweight filtering/reporting and optional sync jobs without parsing full results.

alter table public.campaigns
  add column if not exists follow_up_next_send_at timestamptz;

alter table public.campaigns
  add column if not exists follow_up_approval_status text
    check (
      follow_up_approval_status is null
      or follow_up_approval_status in (
        'pending_review',
        'partially_approved',
        'approved',
        'rejected'
      )
    );

alter table public.campaigns
  add column if not exists follow_up_engine_snapshot jsonb;

comment on column public.campaigns.follow_up_next_send_at is
  'Prompt 91: Next suggested UTC send among approved (or first pending) smart follow-up steps.';

comment on column public.campaigns.follow_up_approval_status is
  'Prompt 91: Aggregate approval state across smart follow-up steps.';

comment on column public.campaigns.follow_up_engine_snapshot is
  'Prompt 91: Copy of smart_follow_up_engine for queries; kept in sync with results JSON when possible.';

create index if not exists campaigns_follow_up_next_send_idx
  on public.campaigns (user_id, follow_up_next_send_at)
  where follow_up_next_send_at is not null;
