-- Prompt 162 — Allow voice mail rows in inbox_messages (`direction = inbound_voice`).
-- Run in Supabase SQL Editor after `ensure_inbox_schema` / inbox_p128.

alter table public.inbox_messages drop constraint if exists inbox_messages_direction_check;
alter table public.inbox_messages add constraint inbox_messages_direction_check
  check (direction in ('inbound', 'outbound', 'draft', 'inbound_voice'));

alter table public.inbox_messages drop constraint if exists inbox_messages_thread_required_check;
alter table public.inbox_messages add constraint inbox_messages_thread_required_check
  check (thread_id is not null or direction = 'draft');

comment on column public.inbox_messages.direction is
  'Prompt 162: inbound_voice = Twilio inbound recording + transcript.';
