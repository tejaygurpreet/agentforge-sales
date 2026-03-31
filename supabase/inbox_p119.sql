-- Prompt 119 — Inbox archive, snooze, labels (Professional Inbox settings).
-- Run after inbox_p117.sql.

alter table public.inbox_threads
  add column if not exists archived_at timestamptz;

alter table public.inbox_threads
  add column if not exists snoozed_until timestamptz;

alter table public.inbox_threads
  add column if not exists labels text[] not null default '{}'::text[];

comment on column public.inbox_threads.archived_at is 'Prompt 119 — hidden from main inbox until restored.';
comment on column public.inbox_threads.snoozed_until is 'Prompt 119 — thread hidden until this time (UTC).';
comment on column public.inbox_threads.labels is 'Prompt 119 — user-defined labels (lowercase slugs).';

create index if not exists inbox_threads_user_archived_idx
  on public.inbox_threads (user_id, archived_at)
  where archived_at is not null;
