-- Cancelling a just-registered order isn't always "the table walked out."
-- A cashier who registered an order and then heard "actually wait, give us
-- a minute" needs to void that registration and go help another table
-- WITHOUT marking this one for cleaning — the guests are still sitting
-- right there. p_still_occupied lets the caller say which case this is;
-- defaults to false so every existing call site (none of which pass it yet)
-- keeps today's "table walked out, needs cleaning" behavior unchanged.
create or replace function cancel_dine_in_order(p_order_id bigint, p_still_occupied boolean default false)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_table_id bigint;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  update orders set status = 'cancelled'
    where id = p_order_id and business_id = v_business_id and payment_status = 'unpaid'
    returning table_id into v_table_id;

  if v_table_id is null then
    raise exception 'order not found or already paid';
  end if;

  update restaurant_tables
    set status = case when p_still_occupied then 'awaiting_order' else 'cleaning' end,
        active_order_id = null
    where id = v_table_id and business_id = v_business_id;

  return v_table_id;
end;
$$;
