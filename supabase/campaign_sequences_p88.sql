-- Prompt 88 — Multi-channel sequence playbooks (workspace-scoped; UI + milestone tracking).
-- Run in Supabase SQL Editor after workspace_members exists.
-- The LangGraph pipeline order is unchanged; `steps` define display order and progress mapping.

create table if not exists public.campaign_sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  /** JSON array: { id, channel: email|linkedin|call|follow_up, label? }[] — see lib/sequences.ts */
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_sequences_workspace_idx
  on public.campaign_sequences (workspace_id, updated_at desc);

comment on table public.campaign_sequences is
  'Prompt 88: Reusable multi-channel sequences per workspace (saved steps JSON; graph flow remains linear).';

alter table public.campaign_sequences enable row level security;

grant select, insert, update, delete on public.campaign_sequences to authenticated;

create policy "Workspace members manage campaign_sequences"
  on public.campaign_sequences
  for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = campaign_sequences.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = campaign_sequences.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

grant select, insert, update, delete on public.campaign_sequences to service_role;
