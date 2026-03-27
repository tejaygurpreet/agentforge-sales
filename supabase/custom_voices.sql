-- Prompt 78 — Per-user custom SDR voices (name, description, examples, tone instructions).
-- Run in Supabase SQL Editor. RLS: owners only; app uses authenticated Supabase client for CRUD from server actions.

create table if not exists public.custom_voices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null,
  examples jsonb not null,
  tone_instructions text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_voices_examples_array check (jsonb_typeof(examples) = 'array')
);

create index if not exists custom_voices_user_id_idx on public.custom_voices (user_id, created_at desc);

alter table public.custom_voices enable row level security;

grant select, insert, update, delete on public.custom_voices to authenticated;

create policy "Users manage own custom voices"
  on public.custom_voices
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.custom_voices is 'User-defined SDR voice presets (Prompt 78). examples: JSON array of 2–3 sample strings. At-rest encryption optional via Supabase Vault for enterprise; standard RLS applies.';
