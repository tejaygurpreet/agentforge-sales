-- Prompt 98 — AI proposal / quote PDF metadata on campaigns + optional public storage for PDFs.
-- Run in Supabase SQL Editor after public.campaigns exists.

alter table public.campaigns add column if not exists proposal_status text;

alter table public.campaigns add column if not exists generated_proposal_url text;

comment on column public.campaigns.proposal_status is
  'Prompt 98: none | generating | ready | failed — AI proposal/quote generation state.';

comment on column public.campaigns.generated_proposal_url is
  'Prompt 98: public URL to the last generated proposal PDF (Supabase Storage) when upload succeeded.';

create index if not exists campaigns_proposal_status_idx
  on public.campaigns (proposal_status)
  where proposal_status is not null and proposal_status <> 'none';

-- Public bucket for proposal PDFs (path: {user_id}/{thread_id}/proposal.pdf).
insert into storage.buckets (id, name, public)
values ('campaign-proposals', 'campaign-proposals', true)
on conflict (id) do nothing;

create policy "Users upload own campaign proposals"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'campaign-proposals'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "Users update own campaign proposals"
on storage.objects for update
to authenticated
using (
  bucket_id = 'campaign-proposals'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "Users delete own campaign proposals"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'campaign-proposals'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "Public read campaign proposals"
on storage.objects for select
to public
using (bucket_id = 'campaign-proposals');
