-- Prompt 128 — Idempotent inbox schema (callable via `rpc('ensure_inbox_schema')` from service role).
-- Merges inbox_p115 + inbox_p117 + inbox_p119. Safe to run multiple times.
-- Requires `public.reply_analyses` for the FK on `inbox_messages.reply_analysis_id` (same as inbox_p115).

create or replace function public.ensure_inbox_schema()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  alter table public.profiles add column if not exists inbox_local_part text;

  create unique index if not exists profiles_inbox_local_part_uidx
    on public.profiles (inbox_local_part)
    where inbox_local_part is not null and length(trim(inbox_local_part)) > 0;

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

  alter table public.inbox_threads add column if not exists user_last_read_at timestamptz;
  alter table public.inbox_threads add column if not exists archived_at timestamptz;
  alter table public.inbox_threads add column if not exists snoozed_until timestamptz;
  alter table public.inbox_threads add column if not exists labels text[] not null default '{}'::text[];

  create unique index if not exists inbox_threads_user_prospect_uidx
    on public.inbox_threads (user_id, lower(prospect_email));

  create index if not exists inbox_threads_user_last_idx
    on public.inbox_threads (user_id, last_message_at desc);

  create index if not exists inbox_threads_user_archived_idx
    on public.inbox_threads (user_id, archived_at)
    where archived_at is not null;

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

  alter table public.inbox_messages add column if not exists reply_analysis_id uuid
    references public.reply_analyses (id) on delete set null;
  alter table public.inbox_messages add column if not exists analyzed_at timestamptz;

  -- Prompt 152 — per-message read state + compose/reply drafts stored as rows (`direction = 'draft'`).
  alter table public.inbox_messages add column if not exists is_read boolean not null default false;

  alter table public.inbox_messages drop constraint if exists inbox_messages_direction_check;
  alter table public.inbox_messages add constraint inbox_messages_direction_check
    check (direction in ('inbound', 'outbound', 'draft'));

  alter table public.inbox_messages alter column thread_id drop not null;

  alter table public.inbox_messages drop constraint if exists inbox_messages_thread_required_check;
  alter table public.inbox_messages add constraint inbox_messages_thread_required_check
    check (thread_id is not null or direction = 'draft');

  alter table public.inbox_threads enable row level security;
  alter table public.inbox_messages enable row level security;

  grant select, insert, update, delete on table public.inbox_threads to authenticated;
  grant select, insert, update, delete on table public.inbox_messages to authenticated;

  drop policy if exists "Users read own inbox threads" on public.inbox_threads;
  drop policy if exists "Users insert own inbox threads" on public.inbox_threads;
  drop policy if exists "Users update own inbox threads" on public.inbox_threads;
  drop policy if exists "Users delete own inbox threads" on public.inbox_threads;

  create policy "Users read own inbox threads"
    on public.inbox_threads for select to authenticated
    using (auth.uid() = user_id);

  create policy "Users insert own inbox threads"
    on public.inbox_threads for insert to authenticated
    with check (auth.uid() = user_id);

  create policy "Users update own inbox threads"
    on public.inbox_threads for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

  create policy "Users delete own inbox threads"
    on public.inbox_threads for delete to authenticated
    using (auth.uid() = user_id);

  drop policy if exists "Users read own inbox messages" on public.inbox_messages;
  drop policy if exists "Users insert own inbox messages" on public.inbox_messages;
  drop policy if exists "Users update own inbox messages" on public.inbox_messages;
  drop policy if exists "Users delete own inbox messages" on public.inbox_messages;

  create policy "Users read own inbox messages"
    on public.inbox_messages for select to authenticated
    using (auth.uid() = user_id);

  create policy "Users insert own inbox messages"
    on public.inbox_messages for insert to authenticated
    with check (auth.uid() = user_id);

  create policy "Users update own inbox messages"
    on public.inbox_messages for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

  create policy "Users delete own inbox messages"
    on public.inbox_messages for delete to authenticated
    using (auth.uid() = user_id);

  -- Prompt 129 — compose drafts (auto-save + list + delete)
  create table if not exists public.inbox_drafts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    to_email text not null default '',
    subject text not null default '',
    body_text text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create index if not exists inbox_drafts_user_updated_idx
    on public.inbox_drafts (user_id, updated_at desc);

  alter table public.inbox_drafts enable row level security;

  grant select, insert, update, delete on table public.inbox_drafts to authenticated;

  drop policy if exists "Users read own inbox drafts" on public.inbox_drafts;
  drop policy if exists "Users insert own inbox drafts" on public.inbox_drafts;
  drop policy if exists "Users update own inbox drafts" on public.inbox_drafts;
  drop policy if exists "Users delete own inbox drafts" on public.inbox_drafts;

  create policy "Users read own inbox drafts"
    on public.inbox_drafts for select to authenticated
    using (auth.uid() = user_id);

  create policy "Users insert own inbox drafts"
    on public.inbox_drafts for insert to authenticated
    with check (auth.uid() = user_id);

  create policy "Users update own inbox drafts"
    on public.inbox_drafts for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

  create policy "Users delete own inbox drafts"
    on public.inbox_drafts for delete to authenticated
    using (auth.uid() = user_id);
end;
$$;

comment on function public.ensure_inbox_schema() is 'Prompt 128 — idempotent inbox DDL; invoked from app via service role.';

grant execute on function public.ensure_inbox_schema() to service_role;
