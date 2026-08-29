-- Real, free Web Push (same VAPID pipeline as the loyalty card) for the
-- restaurant owner/manager themselves — configurable in Settings, delivered
-- to whatever device(s) they install the dashboard PWA on.

alter table businesses add column notify_low_stock boolean not null default false;
alter table businesses add column notify_low_stock_pct numeric not null default 20;
alter table businesses add column notify_new_order boolean not null default false;
alter table businesses add column notify_refund_cancel boolean not null default false;
alter table businesses add column notify_sales_target boolean not null default false;
alter table businesses add column notify_sales_target_amount numeric not null default 0;

-- One row per (profile, device) — unlike the customer loyalty flow, these are
-- real authenticated dashboard/POS users, so subscribing is a direct
-- RLS-gated insert (no anon security-definer RPC needed).
create table owner_push_subscriptions (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index owner_push_subscriptions_business_id_idx on owner_push_subscriptions(business_id);
alter table owner_push_subscriptions enable row level security;

create policy "owner push subs insert own" on owner_push_subscriptions for insert
  with check (profile_id = auth.uid() and business_id = current_business_id());
create policy "owner push subs select own" on owner_push_subscriptions for select
  using (profile_id = auth.uid());
create policy "owner push subs delete own" on owner_push_subscriptions for delete
  using (profile_id = auth.uid());
