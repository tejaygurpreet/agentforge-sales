-- Prompt 81 — Team collaboration / multi-user workspaces.
-- Backward-compatible: each user keeps a personal workspace_id = auth.uid().

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  invited_email text,
  status text not null default 'active' check (status in ('active', 'pending')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  constraint workspace_member_identity_check check (
    (status = 'active' and user_id is not null)
    or
    (status = 'pending' and invited_email is not null)
  )
);

create unique index if not exists workspace_pending_invite_idx
  on public.workspace_members (workspace_id, lower(invited_email))
  where user_id is null and status = 'pending';

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id, workspace_id, role);

alter table public.workspace_members enable row level security;

grant select, insert, update, delete on public.workspace_members to authenticated;

-- Members can view other members in workspaces they belong to.
create policy "Workspace members can read workspace roster"
  on public.workspace_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- Active admins can add invites/members to their workspace.
create policy "Workspace admins can add members"
  on public.workspace_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role = 'admin'
    )
  );

-- Active admins can update rows in their workspace.
create policy "Workspace admins can update members"
  on public.workspace_members
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role = 'admin'
    )
  );

-- Active admins can remove rows in their workspace.
create policy "Workspace admins can delete members"
  on public.workspace_members
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role = 'admin'
    )
  );

comment on table public.workspace_members is
  'Prompt 81: workspace membership + pending invites. Personal fallback workspace uses workspace_id = user_id.';

