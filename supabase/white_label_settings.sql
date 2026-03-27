-- Prompt 79 — Per-user white-label / reseller branding (dashboard, PDFs, emails, exports).
-- Run in Supabase SQL Editor. RLS: owners only.

create table if not exists public.white_label_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  app_name text not null default '',
  company_name text not null default '',
  primary_color text not null default '#3b82f6',
  secondary_color text not null default '#0f172a',
  support_email text not null default '',
  logo_url text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.white_label_settings enable row level security;

grant select, insert, update, delete on public.white_label_settings to authenticated;

create policy "Users manage own white-label settings"
  on public.white_label_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.white_label_settings is 'White-label: app name, company, colors, support email, logo URL. Empty = fall back to AgentForge Sales in app.';
