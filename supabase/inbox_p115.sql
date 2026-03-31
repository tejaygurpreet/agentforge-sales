-- Prompt 115 — Professional email inbox: threads + inbound messages (Resend inbound webhook).
-- Run in Supabase SQL Editor after profiles.sql and reply-analyses.sql.

-- Stable local-part for routing inbound mail (unique per user).
alter table public.profiles
  add column if not exists inbox_local_part text;

create unique index if not exists profiles_inbox_local_part_uidx
  on public.profiles (inbox_local_part)
  where inbox_local_part is not null and length(trim(inbox_local_part)) > 0;

comment on column public.profiles.inbox_local_part is 'Prompt 115 — local-part for user@verified-domain (inbound routing + From); synced from full_name with uniqueness.';

-- One conversation per (user, prospect email).
create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prospect_email text not null,
  subject text not null default '',
  snippet text not null default '',
  last_message_at timestamptz not null default now(),
  campaign_thread_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inbox_threads_user_prospect_uidx
  on public.inbox_threads (user_id, lower(prospect_email));

create index if not exists inbox_threads_user_last_idx
  on public.inbox_threads (user_id, last_message_at desc);

comment on table public.inbox_threads is 'Prompt 115 — Gmail-like thread per prospect email for a user.';

-- Individual messages (inbound from prospects; optional outbound audit later).
create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.inbox_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  from_email text not null default '',
  to_email text not null default '',
  subject text not null default '',
  body_text text not null default '',
  body_html text,
  provider_message_id text,
  raw jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  reply_analysis_id uuid references public.reply_analyses (id) on delete set null,
  analyzed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists inbox_messages_thread_received_idx
  on public.inbox_messages (thread_id, received_at desc);

create index if not exists inbox_messages_user_received_idx
  on public.inbox_messages (user_id, received_at desc);

comment on table public.inbox_messages is 'Prompt 115 — inbound copies from Resend; optional link to reply_analyses after Analyze.';

alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;

grant select, insert, update, delete on table public.inbox_threads to authenticated;
grant select, insert, update, delete on table public.inbox_messages to authenticated;

create policy "Users read own inbox threads"
  on public.inbox_threads
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own inbox threads"
  on public.inbox_threads
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own inbox threads"
  on public.inbox_threads
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own inbox threads"
  on public.inbox_threads
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Users read own inbox messages"
  on public.inbox_messages
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own inbox messages"
  on public.inbox_messages
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own inbox messages"
  on public.inbox_messages
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own inbox messages"
  on public.inbox_messages
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Service role (webhook) bypasses RLS — inserts use service role in app code.
