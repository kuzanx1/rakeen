-- Real, free Web Push (VAPID, no paid service) for the loyalty card, plus
-- owner-customizable card branding (logo/banner/accent color).

create table push_subscriptions (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_customer_id_idx on push_subscriptions(customer_id);
-- RLS enabled, no policies: only touched via the subscribe_loyalty_push() RPC
-- (anon, scoped by token) and the service-role send path (bypasses RLS) —
-- nothing else should ever read or write this table directly.
alter table push_subscriptions enable row level security;

alter table businesses add column loyalty_logo_url text;
alter table businesses add column loyalty_banner_url text;
alter table businesses add column loyalty_accent_color text not null default '#C4FF2B';

create or replace function subscribe_loyalty_push(p_token uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
begin
  select id into v_customer_id from customers where public_token = p_token;
  if v_customer_id is null then
    raise exception 'card not found';
  end if;
  insert into push_subscriptions (customer_id, endpoint, p256dh, auth)
  values (v_customer_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set customer_id = excluded.customer_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
grant execute on function subscribe_loyalty_push(uuid, text, text, text) to anon;

-- the existing function's return columns differ (no logo/banner/accent),
-- and Postgres won't let create-or-replace change a function's OUT columns
drop function if exists get_loyalty_card(uuid);

create function get_loyalty_card(p_token uuid)
returns table(customer_name text, loyalty_points numeric, business_name text, logo_url text, banner_url text, accent_color text)
language sql
security definer
stable
set search_path = public
as $$
  select c.name, c.loyalty_points, b.name, b.loyalty_logo_url, b.loyalty_banner_url, b.loyalty_accent_color
  from customers c join businesses b on b.id = c.business_id
  where c.public_token = p_token;
$$;

-- Storage bucket for logo/banner uploads — one folder per business
-- (<business_id>/...), public read (the card page needs to display them
-- without auth), write restricted to that business's owner/manager/loyalty-
-- permitted staff.
insert into storage.buckets (id, name, public)
values ('loyalty-branding', 'loyalty-branding', true)
on conflict (id) do nothing;

create policy "loyalty branding public read" on storage.objects for select
  using (bucket_id = 'loyalty-branding');
create policy "loyalty branding owner insert" on storage.objects for insert
  with check (bucket_id = 'loyalty-branding' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:loyalty'));
create policy "loyalty branding owner update" on storage.objects for update
  using (bucket_id = 'loyalty-branding' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:loyalty'))
  with check (bucket_id = 'loyalty-branding' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:loyalty'));
create policy "loyalty branding owner delete" on storage.objects for delete
  using (bucket_id = 'loyalty-branding' and (storage.foldername(name))[1] = current_business_id()::text and has_permission('screen:loyalty'));
