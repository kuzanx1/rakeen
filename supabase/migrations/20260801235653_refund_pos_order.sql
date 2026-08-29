-- Refunding an order needs to happen through a security-definer RPC, same
-- reasoning as complete_pos_order(): orders has no direct UPDATE policy on
-- purpose (only the audited RPC paths can mutate it). Only a 'completed'
-- order can be refunded (no double-refunding, no "refunding" a cancelled
-- order). Note: this only flips status — it does not restock stock_items,
-- since the original per-line stock decrements aren't persisted anywhere to
-- reverse exactly; that's a real limitation, not an oversight.
create or replace function refund_pos_order(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_business_id bigint;
begin
  if not (has_permission('pos:register') or has_permission('screen:orders')) then
    raise exception 'not authorized';
  end if;

  select status, business_id into v_status, v_business_id from orders where id = p_order_id;
  if v_business_id is null or v_business_id <> current_business_id() then
    raise exception 'order not found';
  end if;
  if v_status <> 'completed' then
    raise exception 'only completed orders can be refunded';
  end if;

  update orders set status = 'refunded' where id = p_order_id;
end;
$$;
