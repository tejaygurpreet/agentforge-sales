-- Prompt 117 — Unread state + Realtime publication for Professional Inbox.
-- Run in Supabase SQL Editor after inbox_p115.sql.

-- Last time the user opened this thread in the dashboard (for Unread badge / filter).
alter table public.inbox_threads
  add column if not exists user_last_read_at timestamptz;

comment on column public.inbox_threads.user_last_read_at is 'Prompt 117 — set when user views thread; unread when last_message_at > user_last_read_at or user_last_read_at is null.';

-- Also enable **Realtime** for `inbox_messages` and `inbox_threads` (Dashboard → Database → Publications
-- / Replication, or run `alter publication supabase_realtime add table …` if your project allows it).
