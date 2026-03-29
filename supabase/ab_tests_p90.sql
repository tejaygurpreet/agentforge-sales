-- Prompt 90 — Advanced A/B experiments (batch voice / template / sequence variants) with auto-optimization metadata.
-- Run in Supabase SQL Editor after workspace_members exists.
-- Campaign rows continue to use existing `ab_test_id` + `ab_variant` (Prompt 85); this table adds experiment registry + winner summary.

create table if not exists public.ab_tests (
  id uuid primary key,
  workspace_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Experiment',
  /** batch_voice | batch_mixed | pair_voice — informational for UI */
  experiment_type text not null default 'batch_voice',
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  /** Variant config: voices, template ids, sequence id, lead count, etc. */
  config jsonb not null default '{}'::jsonb,
  winner_variant text check (winner_variant is null or winner_variant in ('A', 'B', 'tie')),
  winner_reason text,
  /** Aggregated means, counts, optimization scores — written when status = completed */
  metrics_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ab_tests_workspace_idx
  on public.ab_tests (workspace_id, created_at desc);

comment on table public.ab_tests is
  'Prompt 90: Registry of multi-lead or advanced A/B runs; campaigns.ab_test_id may reference id here.';

alter table public.ab_tests enable row level security;

grant select, insert, update, delete on public.ab_tests to authenticated;

create policy "Workspace members manage ab_tests"
  on public.ab_tests
  for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ab_tests.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ab_tests.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

grant select, insert, update, delete on public.ab_tests to service_role;
