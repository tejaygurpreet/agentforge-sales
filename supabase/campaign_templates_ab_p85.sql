-- Prompt 85 — Campaign templates library + A/B test tracking on saved campaigns.
-- Run in Supabase SQL Editor after workspace_members exists.

-- Reusable template rows (workspace-scoped): default lead + voice settings from a winning run.
create table if not exists public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  /** JSON: LeadFormInput-shaped defaults (sdr_voice_tone, notes, linkedin_url, etc.). */
  payload jsonb not null default '{}'::jsonb,
  source_campaign_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_templates_workspace_idx
  on public.campaign_templates (workspace_id, created_at desc);

comment on table public.campaign_templates is
  'Prompt 85: Saved campaign presets per workspace for fast re-runs and A/B setup.';

alter table public.campaign_templates enable row level security;

grant select, insert, update, delete on public.campaign_templates to authenticated;

create policy "Workspace members manage campaign_templates"
  on public.campaign_templates
  for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = campaign_templates.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = campaign_templates.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

grant select, insert, update, delete on public.campaign_templates to service_role;

-- A/B linkage + template provenance on persisted campaigns (nullable = normal runs).
alter table public.campaigns
  add column if not exists ab_test_id uuid;

alter table public.campaigns
  add column if not exists ab_variant text;

alter table public.campaigns
  add column if not exists template_id uuid;

alter table public.campaigns
  add column if not exists ab_voice_note text;

comment on column public.campaigns.ab_test_id is
  'Prompt 85: Same UUID on variant A and B rows for one A/B experiment.';

comment on column public.campaigns.ab_variant is
  'Prompt 85: A or B — paired with ab_test_id.';

comment on column public.campaigns.template_id is
  'Prompt 85: campaign_templates.id when run was started from a template.';

comment on column public.campaigns.ab_voice_note is
  'Prompt 85: Optional extra note appended to lead context for same-voice micro-variations.';

create index if not exists campaigns_ab_test_idx
  on public.campaigns (ab_test_id, ab_variant)
  where ab_test_id is not null;
