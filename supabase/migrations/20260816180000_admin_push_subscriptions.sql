-- Push notifications for the platform admin (Ammar) when a new WhatsApp
-- message arrives on Rakeen's own number — not scoped to any business (the
-- existing owner_push_subscriptions is business_id-scoped and doesn't fit
-- here), gated purely by the isAdminEmail allowlist at the API route level,
-- same as every other /api/admin/* route. RLS enabled with no policies —
-- only the service-role client (used by those routes) can touch this table.
create table admin_push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  admin_email text not null,
  created_at timestamptz not null default now()
);
alter table admin_push_subscriptions enable row level security;
