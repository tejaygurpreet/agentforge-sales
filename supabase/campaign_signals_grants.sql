-- Run if `campaign_signals` exists but authenticated clients cannot select (Prompt 70).

grant usage on schema public to authenticated;
grant select on table public.campaign_signals to authenticated;
