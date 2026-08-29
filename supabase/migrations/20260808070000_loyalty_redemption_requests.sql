-- Replaces the push-code redemption gate (shipped this session, zero real
-- rows, safe to replace cleanly) with a live in-card confirm: the cashier's
-- action creates a pending request, the customer's OWN loyalty-card page
-- (already open, or opened now) polls for it and shows a confirm/decline
-- prompt they tap themselves. No push dependency — push becomes a
-- best-effort nudge, never required — and the security boundary becomes
-- "only whoever has that physical card page open can act on it," which is
-- what actually guarantees the real cardholder is the one benefiting.
drop function if exists verify_loyalty_redemption_code(bigint, text);
drop table if exists loyalty_redemption_codes;

create table loyalty_redemption_requests (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  business_id bigint not null references businesses(id),
  status text not null default 'pending' check (status in ('pending','confirmed','declined','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz
);
create index loyalty_redemption_requests_customer_idx on loyalty_redemption_requests(customer_id);

alter table loyalty_redemption_requests enable row level security;

-- POS reads this directly (matches how it already reads orders/customers) —
-- creation and the best-effort push happen server-side (service role), so
-- this is select-only.
create policy loyalty_redemption_requests_select on loyalty_redemption_requests for select
  using (business_id = current_business_id() and has_permission('pos:register'));

-- Customer side has no auth session — same posture as get_loyalty_card:
-- the public_token itself is the sole gate, resolved server-side.
create or replace function get_pending_loyalty_request(p_token uuid)
returns table(id bigint, business_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select r.id, b.name, r.expires_at
    from loyalty_redemption_requests r
    join customers c on c.id = r.customer_id
    join businesses b on b.id = r.business_id
    where c.public_token = p_token
      and r.status = 'pending'
      and r.expires_at > now()
    order by r.created_at desc
    limit 1;
end;
$$;
grant execute on function get_pending_loyalty_request(uuid) to anon;

create or replace function respond_loyalty_redemption_request(p_token uuid, p_request_id bigint, p_approve boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated bigint;
begin
  update loyalty_redemption_requests r
  set status = case when p_approve then 'confirmed' else 'declined' end,
      responded_at = now()
  from customers c
  where r.customer_id = c.id
    and c.public_token = p_token
    and r.id = p_request_id
    and r.status = 'pending'
    and r.expires_at > now()
  returning r.id into v_updated;

  return v_updated is not null;
end;
$$;
grant execute on function respond_loyalty_redemption_request(uuid, bigint, boolean) to anon;
