-- If you already created `public.campaigns` before grants were added, run this once
-- so the dashboard can list rows with the user JWT (fixes empty / permission errors).

grant usage on schema public to authenticated;
grant select on table public.campaigns to authenticated;
