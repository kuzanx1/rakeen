-- The delivery lifecycle stopped at "ready" (handed to the delivery rep) —
-- nothing tracked whether the rep actually dropped the order off, so a ready
-- delivery order silently vanished from the POS's "جارية" (running) list the
-- instant it was marked ready, with no way for the cashier to confirm the
-- delivery actually completed. This adds a final delivered_at stage + RPC,
-- mirroring ready_at/mark_delivery_order_ready exactly.
alter table orders add column delivered_at timestamptz;

create or replace function mark_delivery_order_delivered(p_order_id bigint)
returns table(delivered_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  return query
  update orders set
    delivered_at = now()
  where orders.id = p_order_id
    and orders.business_id = v_business_id
    and orders.channel = 'delivery'
    and orders.ready_at is not null
    and orders.delivered_at is null
  returning orders.delivered_at;
end;
$$;
