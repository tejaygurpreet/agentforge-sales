-- Prompt 75 (HubSpot) — Private App access token per user (server-side only via service role).
-- Run in Supabase SQL Editor. Do NOT grant SELECT to authenticated — tokens must not be readable from the browser.

create table if not exists public.user_hubspot_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_hubspot_credentials enable row level security;

-- No policies: only service_role can access (bypasses RLS). Prevents anon/authenticated JWT from reading tokens.
revoke all on public.user_hubspot_credentials from public;
revoke all on public.user_hubspot_credentials from anon;
revoke all on public.user_hubspot_credentials from authenticated;
grant select, insert, update, delete on public.user_hubspot_credentials to service_role;

comment on table public.user_hubspot_credentials is 'HubSpot Private App token; read/write only via Next.js server actions with SUPABASE_SERVICE_ROLE_KEY.';
