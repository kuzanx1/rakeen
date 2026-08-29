-- Real escape hatches for the table lifecycle built last round: a cashier
-- needs a way to release a table that was seated but never ordered, move
-- an in-progress order to a different table, and void an order that walked
-- out before paying — without any of it silently corrupting sales figures.
-- Also brings back the ability to book a SPECIFIC table in advance (the
-- pre-waitlist model), as an owner-configurable option alongside the
-- general walk-in queue rather than replacing it.

alter table businesses add column tables_specific_booking_enabled boolean not null default false;

-- ===== cancel_dine_in_order: void an unpaid tab (walked out, mistake, etc) =====
-- Reuses orders.status='cancelled' — defined in the original check
-- constraint but never actually written anywhere in the codebase until now.
-- Sales/VAT/Tax reports already filter on status='completed', so a
-- cancelled order is automatically excluded from revenue everywhere without
-- touching a single report query. Deliberately does NOT reverse the stock
-- decrement — by the time an order exists the kitchen may already have
-- prepped it, so the ingredients are genuinely gone; correcting inventory
-- for a specific wasted/returned item is a manual Inventory-screen call,
-- not something this function should guess at.
create or replace function cancel_dine_in_order(p_order_id bigint)
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

  update restaurant_tables set status = 'cleaning', active_order_id = null
    where id = v_table_id and business_id = v_business_id;

  return v_table_id;
end;
$$;

-- ===== move_table_order: guest moved to a different table mid-order =====
-- Carries the OLD table's live status onto the new one (serving stays
-- serving, awaiting_payment stays awaiting_payment) rather than assuming —
-- a party mid-checkout that switches tables shouldn't silently reset to
-- "order just taken". The vacated table always goes to cleaning, same rule
-- as everywhere else: a human confirms it's actually cleared before it's
-- bookable again.
create or replace function move_table_order(p_order_id bigint, p_new_table_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_old_table_id bigint;
  v_old_status text;
  v_rows int;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select table_id into v_old_table_id from orders
    where id = p_order_id and business_id = v_business_id and payment_status = 'unpaid';
  if v_old_table_id is null then
    raise exception 'order not found or already paid';
  end if;

  select status into v_old_status from restaurant_tables where id = v_old_table_id and business_id = v_business_id;

  update restaurant_tables set status = v_old_status, active_order_id = p_order_id
    where id = p_new_table_id and business_id = v_business_id and status = 'available';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'new table is not available';
  end if;

  update orders set table_id = p_new_table_id where id = p_order_id;
  update restaurant_tables set status = 'cleaning', active_order_id = null
    where id = v_old_table_id and business_id = v_business_id;

  return p_new_table_id;
end;
$$;
