-- Prompt 83 — AI call transcription + living objection library (workspace-scoped).
-- Run in Supabase SQL Editor after workspace_members / twilio_phone.sql patterns exist.

-- Full call transcripts + LLM extraction (shared across workspace members).
create table if not exists public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id text not null default '',
  twilio_call_sid text not null,
  transcript text not null default '',
  sentiment text,
  summary text,
  insights jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  raw_llm jsonb,
  recording_duration_sec int,
  created_at timestamptz not null default now()
);

create unique index if not exists call_transcripts_twilio_sid_key
  on public.call_transcripts (twilio_call_sid);

create index if not exists call_transcripts_workspace_created_idx
  on public.call_transcripts (workspace_id, created_at desc);

comment on table public.call_transcripts is
  'Prompt 83: Twilio call transcripts + LLM sentiment/objections/insights; workspace-scoped.';

-- Aggregated objections learned from calls (grows over time).
create table if not exists public.objection_library (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  objection_text text not null,
  normalized_key text not null,
  source_transcript_id uuid references public.call_transcripts (id) on delete set null,
  use_count int not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists objection_library_workspace_last_idx
  on public.objection_library (workspace_id, last_seen_at desc);

create unique index if not exists objection_library_workspace_norm_key
  on public.objection_library (workspace_id, normalized_key);

comment on table public.objection_library is
  'Prompt 83: Living objection phrases from transcribed calls; de-duped per workspace via normalized_key.';

alter table public.call_transcripts enable row level security;
alter table public.objection_library enable row level security;

grant select on public.call_transcripts to authenticated;
grant select on public.objection_library to authenticated;
grant insert, update, delete on public.call_transcripts to service_role;
grant insert, update, delete on public.objection_library to service_role;

-- Workspace members can read transcripts + objections for workspaces they belong to.
drop policy if exists "call_transcripts_select_workspace" on public.call_transcripts;
create policy "call_transcripts_select_workspace"
  on public.call_transcripts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = call_transcripts.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

drop policy if exists "objection_library_select_workspace" on public.objection_library;
create policy "objection_library_select_workspace"
  on public.objection_library
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = objection_library.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );
