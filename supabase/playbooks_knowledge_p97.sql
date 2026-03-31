-- Prompt 97 — AI sales playbooks + living knowledge base (workspace-scoped).
-- Run after public.workspace_members exists (Prompt 81).

-- Generated playbooks (one row per explicit generation; optional link to campaign thread).
create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id text,
  lead_name text not null default '',
  company text not null default '',
  title text not null,
  playbook_body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playbooks_workspace_idx
  on public.playbooks (workspace_id, created_at desc);

comment on table public.playbooks is
  'Prompt 97: AI-generated sales playbook JSON per workspace (optionally tied to campaigns.thread_id).';

alter table public.playbooks enable row level security;

grant select, insert, update, delete on public.playbooks to authenticated;

create policy "Workspace members manage playbooks"
  on public.playbooks
  for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = playbooks.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = playbooks.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

grant select, insert, update, delete on public.playbooks to service_role;

-- Living knowledge base — accumulates snippets from campaigns (sync rows use metadata.source = campaign_sync).
create table if not exists public.knowledge_base_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_thread_id text,
  entry_type text not null check (entry_type in ('objection', 'nurture', 'research', 'win', 'account')),
  title text not null,
  body text not null,
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_base_workspace_idx
  on public.knowledge_base_entries (workspace_id, created_at desc);

comment on table public.knowledge_base_entries is
  'Prompt 97: Shared workspace knowledge — objections, nurture notes, research excerpts; campaign_sync rows refresh per thread.';

alter table public.knowledge_base_entries enable row level security;

grant select, insert, update, delete on public.knowledge_base_entries to authenticated;

create policy "Workspace members manage knowledge_base_entries"
  on public.knowledge_base_entries
  for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_base_entries.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = knowledge_base_entries.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

grant select, insert, update, delete on public.knowledge_base_entries to service_role;
