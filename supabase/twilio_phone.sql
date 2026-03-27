-- Prompt 77 — Twilio credentials + voice TwiML sessions + call logs.
-- Run in Supabase SQL Editor. Credentials are only accessible via service_role (Next.js server).

-- Per-user Twilio API credentials and numbers (never expose to browser Supabase client).
create table if not exists public.user_twilio_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_sid text not null,
  auth_token text not null,
  from_phone_e164 text not null,
  user_phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_twilio_credentials enable row level security;
revoke all on public.user_twilio_credentials from public;
revoke all on public.user_twilio_credentials from anon;
revoke all on public.user_twilio_credentials from authenticated;
grant select, insert, update, delete on public.user_twilio_credentials to service_role;

comment on table public.user_twilio_credentials is 'Twilio Account SID, Auth Token, From number; optional user_phone for bridge calls. Server-only via SUPABASE_SERVICE_ROLE_KEY.';

-- Short-lived row for GET /api/twilio/voice?sessionId=… TwiML (voicemail or dial bridge).
create table if not exists public.twilio_voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id text not null,
  kind text not null check (kind in ('bridge', 'voicemail')),
  lead_phone_e164 text not null,
  polly_voice text,
  voicemail_script text,
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  created_at timestamptz not null default now()
);

alter table public.twilio_voice_sessions enable row level security;
revoke all on public.twilio_voice_sessions from public;
revoke all on public.twilio_voice_sessions from anon;
revoke all on public.twilio_voice_sessions from authenticated;
grant select, insert, update, delete on public.twilio_voice_sessions to service_role;

create index if not exists twilio_voice_sessions_expires_idx on public.twilio_voice_sessions (expires_at);

-- Call history for dashboard (readable by owner via RLS).
create table if not exists public.campaign_phone_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id text not null,
  kind text not null check (kind in ('bridge_call', 'voicemail_drop', 'tel_fallback')),
  to_phone_e164 text not null,
  twilio_call_sid text,
  status text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists campaign_phone_logs_user_thread_idx on public.campaign_phone_logs (user_id, thread_id, created_at desc);

alter table public.campaign_phone_logs enable row level security;

grant select on public.campaign_phone_logs to authenticated;
grant insert on public.campaign_phone_logs to service_role;

create policy "Users read own phone logs"
  on public.campaign_phone_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.campaign_phone_logs is 'Twilio call attempts per campaign thread; inserts from server actions.';
