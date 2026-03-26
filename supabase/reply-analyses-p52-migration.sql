-- Prompt 52 — run once in Supabase SQL Editor on existing `reply_analyses` tables.
-- Adds every column the app expects; aligns types with listable product spec (INTEGER interest, JSON defaults).

alter table public.reply_analyses add column if not exists reply_full text;
alter table public.reply_analyses add column if not exists reply_preview text;
alter table public.reply_analyses add column if not exists lead_name text;
alter table public.reply_analyses add column if not exists company text;
alter table public.reply_analyses add column if not exists prospect_email text;
alter table public.reply_analyses add column if not exists analysis jsonb;
alter table public.reply_analyses add column if not exists sentiment text;
alter table public.reply_analyses add column if not exists interest_score integer;
alter table public.reply_analyses add column if not exists suggested_voice text;
alter table public.reply_analyses add column if not exists next_step text;
alter table public.reply_analyses add column if not exists objections jsonb;

-- Backfill NOT NULL text columns if table was created without them
update public.reply_analyses
set reply_full = coalesce(nullif(trim(reply_full), ''), coalesce(nullif(trim(reply_preview), ''), ''))
where reply_full is null or trim(reply_full) = '';

update public.reply_analyses
set reply_preview = coalesce(
  nullif(trim(reply_preview), ''),
  left(regexp_replace(coalesce(nullif(trim(reply_full), ''), ''), '\s+', ' ', 'g'), 280)
)
where reply_preview is null or trim(reply_preview) = '';

alter table public.reply_analyses alter column reply_preview set not null;
alter table public.reply_analyses alter column reply_full set not null;

-- analysis: default + fill nulls
update public.reply_analyses set analysis = '{}'::jsonb where analysis is null;
alter table public.reply_analyses alter column analysis set default '{}'::jsonb;
alter table public.reply_analyses alter column analysis set not null;

-- objections: default + fill nulls
update public.reply_analyses set objections = '[]'::jsonb where objections is null;
alter table public.reply_analyses alter column objections set default '[]'::jsonb;
alter table public.reply_analyses alter column objections set not null;

-- Upgrade smallint interest_score → integer when present
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reply_analyses'
      and column_name = 'interest_score'
      and data_type = 'smallint'
  ) then
    alter table public.reply_analyses
      alter column interest_score type integer using interest_score::integer;
  end if;
end $$;

grant usage on schema public to authenticated;
grant select, insert on table public.reply_analyses to authenticated;
