-- Kitchen Display System: a generic "mark ready" for ANY channel (dine-in,
-- pickup, delivery) — mark_delivery_order_ready stays untouched (still
-- delivery-only, still used by the existing POS delivery-ready button on
-- the merged Orders screen); this is the same idea but for the kitchen
-- board, which shows every order type, not just delivery.
create or replace function mark_order_ready(p_order_id bigint)
returns table(ready_at timestamptz, prep_duration_seconds int)
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
    ready_at = now(),
    prep_duration_seconds = extract(epoch from (now() - orders.created_at))::int
  where orders.id = p_order_id
    and orders.business_id = v_business_id
    and orders.ready_at is null
  returning orders.ready_at, orders.prep_duration_seconds;
end;
$$;

-- The kitchen board needs to see new orders the instant they're rung up —
-- restaurant_tables is already on this publication (see
-- 20260801223031_enable_realtime_tables.sql); orders needs the same.
alter publication supabase_realtime add table orders;
