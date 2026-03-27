-- Prompt 84 — Web Push subscriptions for PWA notifications (VAPID + web-push on server).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id, created_at desc);

alter table public.push_subscriptions enable row level security;

comment on table public.push_subscriptions is
  'Prompt 84: Browser PushSubscription keys for PWA; server sends via web-push + VAPID.';

grant select, insert, delete on public.push_subscriptions to authenticated;

create policy "Users manage own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.push_subscriptions to service_role;
