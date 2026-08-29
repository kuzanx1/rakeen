-- The restaurant only ever knows and controls delivery completion for its
-- OWN online-website orders (source='online') — a Keeta/Jahez/etc rider's
-- actual drop-off is invisible to Rakeen, so asking the cashier to confirm
-- "تم توصيله" for a delivery-platform order was asking them to guess. Those
-- orders now auto-complete (delivered_at set the same moment as ready_at) —
-- restoring the original pre-delivered_at behavior of instantly leaving the
-- active list — while online orders keep the real two-stage
-- ready → delivered confirmation, since the restaurant's own driver is the
-- one who actually knows.
create or replace function mark_delivery_order_ready(p_order_id bigint)
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
    prep_duration_seconds = extract(epoch from (now() - orders.created_at))::int,
    delivered_at = case when orders.source <> 'online' then now() else orders.delivered_at end
  where orders.id = p_order_id
    and orders.business_id = v_business_id
    and orders.channel = 'delivery'
    and orders.ready_at is null
  returning orders.ready_at, orders.prep_duration_seconds;
end;
$$;
