-- Second real production regression found during the Feature Parity
-- Pass (React Native migration, Loyalty item), same root cause and
-- protocol as 20260901020000_restore_complete_pos_order_customer_find_or_create.sql:
-- complete_pos_order() originally EARNED loyalty points on checkout
-- (see 20260802153707_fix_complete_pos_order_ambiguous_item.sql, lines
-- 101-107, quoted verbatim below) -- floor(total / businesses.loyalty_points_divisor)
-- points credited to whichever customer the order resolved to. The
-- 20260829200000_fix_pos_checkout_points_and_customer_id.sql rewrite
-- kept points-REDEMPTION (spending) but dropped points-EARNING entirely
-- -- confirmed by reading that migration's full body, it has no
-- `loyalty_points = loyalty_points + ...` anywhere. register_dine_in_order
-- and pay_dine_in_order never had earning logic at any point in their
-- history either (confirmed by reading their original definitions) --
-- this is restoring a real regression specific to complete_pos_order,
-- not extending capability to functions that never had it.
--
-- Original earning block (customers_and_loyalty era):
--   if v_customer_id is not null then
--     select loyalty_points_divisor into v_points_divisor from businesses where id = v_business_id;
--     v_points_earned := floor(p_total / v_points_divisor);
--     if v_points_earned > 0 then
--       update customers set loyalty_points = loyalty_points + v_points_earned where id = v_customer_id;
--     end if;
--   end if;
--
-- This migration embeds the FULL current function body (including the
-- customer find-or-create restoration from 20260901020000, in case that
-- migration has not yet been applied when this one runs -- `create or
-- replace function` always fully replaces the body, so this migration
-- is correct and self-contained regardless of deployment order) plus
-- the restored earning block, keyed to the SAME v_resolved_customer_id
-- every other part of the function already uses -- not a second,
-- differently-scoped customer resolution.
--
-- Strict scope, same as the customer fix: does NOT touch
-- register_dine_in_order, pay_dine_in_order, redemption logic, payment
-- logic, order logic, or any other RPC/table.
create or replace function complete_pos_order(
  p_client_order_uuid uuid,
  p_branch_id bigint,
  p_shift_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_subtotal numeric,
  p_discount_pct numeric,
  p_discount_amount numeric,
  p_vat_amount numeric,
  p_total numeric,
  p_payment_method text,
  p_cash_amount numeric,
  p_items jsonb,
  p_channel text default 'dine_in',
  p_delivery_platform_id bigint default null,
  p_table_id bigint default null,
  p_staff_member_id bigint default null,
  p_platform_invoice_last4 text default null,
  p_customer_id bigint default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_business_id bigint := current_business_id();
  v_business record;
  v_vat numeric;
  v_total numeric;
  v_auto_ready boolean;
  v_resolved_customer_id bigint;
  v_menu_item_id bigint;
  v_qty numeric;
  v_is_points_redemption boolean;
  v_points_cost numeric;
  v_total_points_cost numeric := 0;
  v_points_divisor numeric;
  v_points_earned numeric;
  item jsonb;
  dec jsonb;
  dec_row record;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select id into v_order_id from orders where client_order_uuid = p_client_order_uuid;
  if v_order_id is not null then
    return v_order_id;
  end if;

  select * into v_business from businesses where id = v_business_id;

  -- Restored find-or-create-by-phone (verbatim logic from
  -- 20260802000753_customers_and_loyalty.sql), only when the caller
  -- didn't already resolve a real customer id.
  v_resolved_customer_id := p_customer_id;
  if v_resolved_customer_id is null and p_customer_phone is not null and length(trim(p_customer_phone)) > 0 then
    select id into v_resolved_customer_id from customers
      where business_id = v_business_id and phone = p_customer_phone;
    if v_resolved_customer_id is null then
      insert into customers (business_id, name, phone)
      values (v_business_id, coalesce(nullif(trim(p_customer_name), ''), p_customer_phone), p_customer_phone)
      returning id into v_resolved_customer_id;
    elsif p_customer_name is not null and length(trim(p_customer_name)) > 0 then
      update customers set name = p_customer_name where id = v_resolved_customer_id;
    end if;
  end if;

  select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
    from compute_vat_split(
      p_subtotal - p_discount_amount,
      case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
      coalesce(v_business.prices_include_vat, true)
    ) cvs;

  v_auto_ready := case p_channel
    when 'dine_in' then v_business.auto_ready_dine_in
    when 'pickup' then v_business.auto_ready_pickup
    when 'delivery' then v_business.auto_ready_delivery_platform
    else false
  end;

  insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone, customer_id,
    subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid,
    channel, delivery_platform_id, table_id, staff_member_id, platform_invoice_last4,
    ready_at, prep_duration_seconds, delivered_at)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone, v_resolved_customer_id,
    p_subtotal, p_discount_pct, p_discount_amount, v_vat, v_total, p_payment_method, p_cash_amount, p_client_order_uuid,
    p_channel, p_delivery_platform_id, p_table_id, p_staff_member_id, p_platform_invoice_last4,
    case when v_auto_ready then now() else null end,
    case when v_auto_ready then 0 else null end,
    case when v_auto_ready and p_channel = 'delivery' then now() else null end)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    v_menu_item_id := nullif(item->>'menu_item_id','')::bigint;
    v_qty := (item->>'qty')::numeric;
    v_is_points_redemption := coalesce((item->>'is_points_redemption')::boolean, false);
    v_points_cost := coalesce((item->>'points_cost')::numeric, 0);
    if v_is_points_redemption and v_points_cost > 0 then
      v_total_points_cost := v_total_points_cost + v_points_cost;
    end if;

    insert into order_items (order_id, menu_item_id, service_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers, cost_at_sale, is_points_redemption, points_spent)
    values (
      v_order_id, v_menu_item_id, nullif(item->>'service_id','')::bigint,
      v_qty, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers',
      case when v_menu_item_id is not null then compute_line_cost(v_menu_item_id, v_qty, item->'box_selections', (item->>'unit_price')::numeric) else null end,
      v_is_points_redemption, v_points_cost
    );

    if v_menu_item_id is not null then
      for dec_row in select * from resolve_menu_item_recipe_decrements(v_menu_item_id, v_qty) loop
        update stock_items set qty_on_hand = qty_on_hand - dec_row.qty, updated_at = now()
        where id = dec_row.stock_item_id and business_id = v_business_id;
      end loop;
      for dec_row in select * from resolve_box_selection_decrements(v_menu_item_id, v_qty, item->'box_selections') loop
        update stock_items set qty_on_hand = qty_on_hand - dec_row.qty, updated_at = now()
        where id = dec_row.stock_item_id and business_id = v_business_id;
      end loop;
      for dec_row in select * from resolve_finished_good_decrement(v_menu_item_id, v_qty) loop
        update stock_items set qty_on_hand = qty_on_hand - dec_row.qty, updated_at = now()
        where id = dec_row.stock_item_id and business_id = v_business_id;
      end loop;
    end if;

    for dec in select * from jsonb_array_elements(coalesce(item->'stock_decrements', '[]'::jsonb)) loop
      update stock_items set qty_on_hand = qty_on_hand - (dec->>'qty')::numeric, updated_at = now()
      where id = (dec->>'stock_item_id')::bigint and business_id = v_business_id;
    end loop;
  end loop;

  if v_total_points_cost > 0 then
    if v_resolved_customer_id is null then
      raise exception 'customer required for points redemption';
    end if;
    update customers set loyalty_points = loyalty_points - v_total_points_cost
      where id = v_resolved_customer_id and business_id = v_business_id and loyalty_points >= v_total_points_cost;
    if not found then
      raise exception 'insufficient loyalty points';
    end if;
  end if;

  -- Restored points-EARNING (same divisor formula as
  -- 20260802153707_fix_complete_pos_order_ambiguous_item.sql), keyed to
  -- the same v_resolved_customer_id -- a walk-in with no phone/id never
  -- earns (nothing to credit), matching original behavior. One
  -- deliberate change from the verbatim original: earns on v_total (this
  -- function's own server-recomputed, authoritative total via
  -- compute_vat_split -- already what gets stored on the order row two
  -- inserts above) rather than the caller-supplied p_total, so a
  -- mismatched/stale client total can never over- or under-credit
  -- points. Never trust client-sent numbers for financial calculations.
  if v_resolved_customer_id is not null then
    v_points_divisor := v_business.loyalty_points_divisor;
    if v_points_divisor is not null and v_points_divisor > 0 then
      v_points_earned := floor(v_total / v_points_divisor);
      if v_points_earned > 0 then
        update customers set loyalty_points = loyalty_points + v_points_earned
          where id = v_resolved_customer_id and business_id = v_business_id;
      end if;
    end if;
  end if;

  if p_table_id is not null then
    update restaurant_tables set status = 'cleaning'
    where id = p_table_id and business_id = v_business_id and status <> 'cleaning';
  end if;

  return v_order_id;
end;
$$;
