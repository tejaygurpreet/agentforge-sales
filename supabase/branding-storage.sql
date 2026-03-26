-- AgentForge Sales — user logos for PDF / branding (Prompt 40).
-- Run in Supabase SQL editor after project creation.

insert into storage.buckets (id, name, public)
values ('branding-logos', 'branding-logos', true)
on conflict (id) do nothing;

-- Authenticated users may upload only under their auth.uid() folder.
create policy "Users upload own branding logos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'branding-logos'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "Users update own branding logos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'branding-logos'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "Users delete own branding logos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'branding-logos'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Public read for PDF client fetch (logo URL in browser).
create policy "Public read branding logos"
on storage.objects for select
to public
using (bucket_id = 'branding-logos');
