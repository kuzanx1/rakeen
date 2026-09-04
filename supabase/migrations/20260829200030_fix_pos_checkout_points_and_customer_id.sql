-- QA finding: the POS checkout RPCs (complete_pos_order, register_dine_in_order,
-- pay_dine_in_order) have never accepted or stored a customer id at all —
-- orders.customer_id was always left NULL by every checkout path. Two real
-- consequences, both silent (no error, just wrong data):
--
-- 1. Loyalty point redemption never actually cost the customer anything.
--    The POS client (rakeen-pos.js buildOrderPayload) already computes and
--    sends is_points_redemption/points_cost per cart line — the cashier UI,
--    the OTP-style confirm-on-the-customer's-own-card-page flow, all of it
--    works — but these two RPCs silently dropped both fields on the floor
--    when inserting order_items, and neither ever touched
--    customers.loyalty_points. A customer could redeem the same "free" item
--    over and over without ever losing a point.
--
-- 2. get_loyalty_card's own tier (Bronze/Silver/Gold/Platinum) and
--    total_saved figures are computed by joining orders to customers via
--    orders.customer_id (see that function) — with customer_id always NULL,
--    that join always returned zero rows, so every customer was
--    permanently stuck at Bronze with 0 SAR saved shown on their real
--    loyalty card, no matter how much they'd actually spent or redeemed.
--
-- Fix: thread p_customer_id through all three RPCs, record it on the order,
-- and — for the two that actually insert order_items — read
-- is_points_redemption/points_cost off each item and deduct the total from
-- the customer's balance, guarded so it can't go negative (handles both a
-- stale client-side affordability check and a genuine concurrent-redemption
-- race the same way: the UPDATE's WHERE clause simply won't match, and that
-- surfaces as a clean exception instead of a silent overdraft).

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
  v_menu_item_id bigint;
  v_qty numeric;
  item jsonb;
  dec jsonb;
  dec_row record;
  v_auto_ready boolean;
  v_is_points_redemption boolean;
  v_points_cost numeric;
  v_total_points_cost numeric := 0;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select id into v_order_id from orders where client_order_uuid = p_client_order_uuid;
  if v_order_id is not null then
    return v_order_id;
  end if;

  select * into v_business from businesses where id = v_business_id;

  if p_customer_id is not null and not exists (
    select 1 from customers where id = p_customer_id and business_id = v_business_id
  ) then
    raise exception 'customer not found';
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
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone, p_customer_id,
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
    if p_customer_id is null then
      raise exception 'customer required for points redemption';
    end if;
    update customers set loyalty_points = loyalty_points - v_total_points_cost
      where id = p_customer_id and business_id = v_business_id and loyalty_points >= v_total_points_cost;
    if not found then
      raise exception 'insufficient loyalty points';
    end if;
  end if;

  if p_table_id is not null then
    update restaurant_tables set status = 'cleaning'
    where id = p_table_id and business_id = v_business_id and status <> 'cleaning';
  end if;

  return v_order_id;
end;
$$;

create or replace function register_dine_in_order(
  p_client_order_uuid uuid,
  p_branch_id bigint,
  p_shift_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_subtotal numeric,
  p_discount_pct numeric,
  p_items jsonb,
  p_table_id bigint,
  p_staff_member_id bigint default null,
  p_existing_order_id bigint default null,
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
  v_existing record;
  v_new_subtotal numeric;
  v_discount_pct numeric;
  v_discount_amount numeric;
  v_vat numeric;
  v_total numeric;
  v_menu_item_id bigint;
  v_qty numeric;
  item jsonb;
  dec jsonb;
  dec_row record;
  v_is_points_redemption boolean;
  v_points_cost numeric;
  v_total_points_cost numeric := 0;
  v_redeem_customer_id bigint;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select * into v_business from businesses where id = v_business_id;

  if p_customer_id is not null and not exists (
    select 1 from customers where id = p_customer_id and business_id = v_business_id
  ) then
    raise exception 'customer not found';
  end if;

  if p_existing_order_id is not null then
    select * into v_existing from orders where id = p_existing_order_id and business_id = v_business_id and payment_status = 'unpaid';
    if v_existing is null then
      raise exception 'order not found or already paid';
    end if;
    v_order_id := p_existing_order_id;
    v_discount_pct := v_existing.discount_pct;
    v_new_subtotal := v_existing.subtotal + p_subtotal;
    -- Appending a round to an already-open tab: redeem against whichever
    -- customer the order already belongs to (set at first registration),
    -- not whatever the client happens to have selected right now — a top-up
    -- round shouldn't silently move a redemption onto a different card.
    v_redeem_customer_id := v_existing.customer_id;

    select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
      from compute_vat_split(
        v_new_subtotal - round(v_new_subtotal * v_discount_pct / 100, 2),
        case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
        coalesce(v_business.prices_include_vat, true)
      ) cvs;
    v_discount_amount := round(v_new_subtotal * v_discount_pct / 100, 2);

    update orders set subtotal = v_new_subtotal, discount_amount = v_discount_amount, vat_amount = v_vat, total = v_total
      where id = v_order_id;
  else
    select id into v_order_id from orders where client_order_uuid = p_client_order_uuid;
    if v_order_id is not null then
      return v_order_id;
    end if;

    v_discount_pct := p_discount_pct;
    v_discount_amount := round(p_subtotal * v_discount_pct / 100, 2);
    v_redeem_customer_id := p_customer_id;
    select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
      from compute_vat_split(
        p_subtotal - v_discount_amount,
        case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
        coalesce(v_business.prices_include_vat, true)
      ) cvs;

    insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone, customer_id,
      subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid,
      channel, table_id, staff_member_id, payment_status, ready_at, prep_duration_seconds)
    values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone, p_customer_id,
      p_subtotal, v_discount_pct, v_discount_amount, v_vat, v_total, null, null, p_client_order_uuid,
      'dine_in', p_table_id, p_staff_member_id, 'unpaid',
      case when v_business.auto_ready_dine_in then now() else null end,
      case when v_business.auto_ready_dine_in then 0 else null end)
    returning id into v_order_id;

    update restaurant_tables set status = 'serving', active_order_id = v_order_id
      where id = p_table_id and business_id = v_business_id;
  end if;

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
    if v_redeem_customer_id is null then
      raise exception 'customer required for points redemption';
    end if;
    update customers set loyalty_points = loyalty_points - v_total_points_cost
      where id = v_redeem_customer_id and business_id = v_business_id and loyalty_points >= v_total_points_cost;
    if not found then
      raise exception 'insufficient loyalty points';
    end if;
  end if;

  return v_order_id;
end;
$$;

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

  -- "Pay after eating" registers with no customer attached at all (see
  -- submitTableOrderRegistration in the POS client — that flow never shows
  -- the customer step). This lets a customer picked at the later payment
  -- step still land on the order for loyalty-card history/tier purposes,
  -- without overwriting one already set at registration (coalesce, same
  -- pattern as the existing name/phone columns just below).
  update orders set
    payment_status = 'paid',
    payment_method = p_payment_method,
    cash_amount = p_cash_amount,
    customer_name = coalesce(p_customer_name, customer_name),
    customer_phone = coalesce(p_customer_phone, customer_phone),
    customer_id = coalesce(customer_id, p_customer_id)
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
