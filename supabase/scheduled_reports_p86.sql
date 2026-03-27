-- Prompt 86 — Advanced reporting: scheduled email delivery (daily/weekly) with filter JSON.
-- Run in Supabase SQL Editor after workspace_members and campaigns exist.

create table if not exists public.scheduled_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  recipient_email text not null,
  cadence text not null check (cadence in ('daily', 'weekly')),
  hour_utc smallint not null check (hour_utc >= 0 and hour_utc <= 23),
  -- 0 = Sunday ... 6 = Saturday (Date.prototype.getUTCDay); null allowed for daily-only rows.
  weekday_utc smallint null check (weekday_utc is null or (weekday_utc >= 0 and weekday_utc <= 6)),
  filters jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_reports_workspace_next_idx
  on public.scheduled_reports (workspace_id, next_run_at)
  where enabled = true;

comment on table public.scheduled_reports is
  'Prompt 86: User schedules for PDF+metrics email reports; processed by /api/cron/scheduled-reports.';

comment on column public.scheduled_reports.filters is
  'JSON: { dateFrom?, dateTo?, voice?, memberUserId? } — same shape as dashboard advanced report filters.';

alter table public.scheduled_reports enable row level security;

grant select, insert, update, delete on public.scheduled_reports to authenticated;
grant select, insert, update, delete on public.scheduled_reports to service_role;

create policy "Workspace members manage scheduled_reports"
  on public.scheduled_reports
  for all
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = scheduled_reports.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = scheduled_reports.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );
