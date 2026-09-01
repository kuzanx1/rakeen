-- Real production bug found while testing Checkpoint 6 (Payment) of the
-- React Native migration, using order 255 (a genuine "dine-in, no table"
-- order — the RN app's own Checkpoint 5 also exercises this exact case).
--
-- pay_dine_in_order() detected "no matching row" by checking whether the
-- UPDATE ... RETURNING table_id produced a NULL, instead of checking
-- whether it produced a row at all. For a dine-in order that legitimately
-- has table_id = NULL (dine-in without an assigned table, an explicitly
-- supported flow), the UPDATE succeeds but table_id is genuinely NULL,
-- so the function raised "order not found or already paid" and — because
-- the exception aborts the whole function call — the payment update was
-- rolled back entirely. Any dine-in order with no table could never
-- actually be paid through this RPC. This is the same RPC the existing
-- PWA already calls (public/pos/rakeen-pos.js), so this bug predates and
-- is unrelated to the React Native migration; it is fixed here rather
-- than worked around client-side because it's a correctness bug in the
-- shared backend contract both clients rely on.
--
-- Fix: use FOUND (set by the preceding UPDATE) to detect "no row matched"
-- instead of testing the nullable table_id column's value.
create or replace function pay_dine_in_order(
  p_order_id bigint,
  p_payment_method text,
  p_cash_amount numeric,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_id bigint default null
) returns bigint
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

  if p_customer_id is not null and not exists (
    select 1 from customers where id = p_customer_id and business_id = v_business_id
  ) then
    raise exception 'customer not found';
  end if;

  update orders set
    payment_status = 'paid',
    payment_method = p_payment_method,
    cash_amount = p_cash_amount,
    customer_name = coalesce(p_customer_name, customer_name),
    customer_phone = coalesce(p_customer_phone, customer_phone),
    customer_id = coalesce(customer_id, p_customer_id)
  where id = p_order_id and business_id = v_business_id and payment_status = 'unpaid'
  returning table_id into v_table_id;

  if not found then
    raise exception 'order not found or already paid';
  end if;

  if v_table_id is not null then
    update restaurant_tables set status = 'cleaning', active_order_id = null
      where id = v_table_id and business_id = v_business_id;
  end if;

  return v_table_id;
end;
$$;
