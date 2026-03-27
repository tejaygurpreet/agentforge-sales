-- Prompt 89 — OAuth refresh tokens for Google Calendar + Microsoft Graph (encrypted at rest by app — see lib/calendar.ts).
-- Run in Supabase SQL Editor. Requires auth.users.

create table if not exists public.user_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  /** Application-layer AES-GCM ciphertext when CALENDAR_TOKEN_ENCRYPTION_KEY is set (lib/calendar.ts). */
  refresh_token_enc text not null,
  email_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists user_calendar_connections_user_idx
  on public.user_calendar_connections (user_id);

comment on table public.user_calendar_connections is
  'Prompt 89: Per-user calendar OAuth refresh tokens; access tokens are derived server-side only.';

alter table public.user_calendar_connections enable row level security;

grant select, insert, update, delete on public.user_calendar_connections to authenticated;

create policy "Users manage own calendar connections"
  on public.user_calendar_connections
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_calendar_connections to service_role;
