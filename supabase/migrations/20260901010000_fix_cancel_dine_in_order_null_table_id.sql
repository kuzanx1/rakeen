-- Same bug class found and fixed in pay_dine_in_order
-- (20260901000000_fix_pay_dine_in_order_null_table_id.sql), now found in
-- its sibling cancel_dine_in_order while testing Checkpoint 7 (Dine-in /
-- Tables) of the React Native migration.
--
-- cancel_dine_in_order detects "no matching row" by checking whether the
-- UPDATE ... RETURNING table_id produced a NULL, instead of checking
-- whether it produced a row at all. For a dine-in order that legitimately
-- has table_id = NULL (dine-in without an assigned table, an explicitly
-- supported flow -- see order 255/262 in the test fixture), the UPDATE
-- succeeds (order.status set to 'cancelled') but table_id is genuinely
-- NULL, so the function raises "order not found or already paid" anyway
-- -- and since the exception aborts the whole function call, the
-- cancellation is rolled back entirely. Confirmed live: registering a
-- fresh tableless order and calling cancel_dine_in_order on it left the
-- order un-cancelled (status stayed at its original value, payment_status
-- stayed 'unpaid') while returning an error claiming it was "not found or
-- already paid" even though it plainly existed and was unpaid.
--
-- This is the same RPC the existing PWA calls, so this bug predates and
-- is unrelated to the React Native migration; any tableless dine-in order
-- could never actually be cancelled through this RPC in production.
--
-- Fix: use FOUND (set by the preceding UPDATE) to detect "no row
-- matched", matching the same fix already applied to pay_dine_in_order.
-- The table-status update below is now also skipped (not attempted with
-- a NULL id) when the order had no table, since there's no table row to
-- update in that case.
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

  if not found then
    raise exception 'order not found or already paid';
  end if;

  if v_table_id is not null then
    update restaurant_tables
      set status = case when p_still_occupied then 'awaiting_order' else 'cleaning' end,
          active_order_id = null
      where id = v_table_id and business_id = v_business_id;
  end if;

  return v_table_id;
end;
$$;
