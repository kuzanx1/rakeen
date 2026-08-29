-- Finished-good inventory: real stock tracking and real inventory decrement
-- for a product WITHOUT ever describing what's inside it. An owner links a
-- menu item straight to one stock_item that represents the finished,
-- already-made product itself (e.g. "بوكس وسط مشكّل — دفعة جاهزة") — when
-- they prep a morning batch of 40, they log qty_on_hand=40 the exact same
-- way they'd log any restock (Purchases screen — supplier can just be
-- "إنتاج ذاتي"), and each sale decrements 1 from that count. No ingredient,
-- no ratio, no recipe ever enters Rakeen in any form for this path — this
-- is the actual answer to "I don't want to state my recipe at all", not a
-- softer version of the encrypted-recipe path (which stays available as an
-- opt-in for owners who separately want ingredient-level tracking anyway).
--
-- Deliberately independent of cost_mode: cost/margin for these items keeps
-- using direct_cost (a single approved number, already the privacy-safe
-- default) — this column only ever answers "how many do I have left",
-- never "what does it cost" or "what's inside".
alter table menu_items add column finished_good_stock_item_id bigint references stock_items(id);

alter table stock_items drop constraint stock_items_category_check;
alter table stock_items add constraint stock_items_category_check check (category in ('raw','packaging','finished_good'));

create or replace function resolve_finished_good_decrement(p_menu_item_id bigint, p_line_qty numeric)
returns table (stock_item_id bigint, qty numeric)
language sql
security definer
stable
set search_path = public
as $$
  select m.finished_good_stock_item_id, p_line_qty
  from menu_items m
  where m.id = p_menu_item_id and m.finished_good_stock_item_id is not null;
$$;

create or replace function public.complete_pos_order(p_client_order_uuid uuid, p_branch_id bigint, p_shift_id bigint, p_customer_name text, p_customer_phone text, p_subtotal numeric, p_discount_pct numeric, p_discount_amount numeric, p_vat_amount numeric, p_total numeric, p_payment_method text, p_cash_amount numeric, p_items jsonb, p_channel text DEFAULT 'dine_in'::text, p_delivery_platform_id bigint DEFAULT NULL::bigint, p_table_id bigint DEFAULT NULL::bigint, p_staff_member_id bigint DEFAULT NULL::bigint, p_platform_invoice_last4 text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select id into v_order_id from orders where client_order_uuid = p_client_order_uuid;
  if v_order_id is not null then
    return v_order_id;
  end if;

  select * into v_business from businesses where id = v_business_id;

  select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
    from compute_vat_split(
      p_subtotal - p_discount_amount,
      case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
      coalesce(v_business.prices_include_vat, true)
    ) cvs;

  insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone,
    subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid,
    channel, delivery_platform_id, table_id, staff_member_id, platform_invoice_last4)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone,
    p_subtotal, p_discount_pct, p_discount_amount, v_vat, v_total, p_payment_method, p_cash_amount, p_client_order_uuid,
    p_channel, p_delivery_platform_id, p_table_id, p_staff_member_id, p_platform_invoice_last4)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into order_items (order_id, menu_item_id, service_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers)
    values (
      v_order_id, nullif(item->>'menu_item_id','')::bigint, nullif(item->>'service_id','')::bigint,
      (item->>'qty')::numeric, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers'
    );

    v_menu_item_id := nullif(item->>'menu_item_id','')::bigint;
    v_qty := (item->>'qty')::numeric;
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

  if p_table_id is not null then
    update restaurant_tables set status = 'cleaning'
    where id = p_table_id and business_id = v_business_id and status <> 'cleaning';
  end if;

  return v_order_id;
end;
$function$;

create or replace function public.register_dine_in_order(p_client_order_uuid uuid, p_branch_id bigint, p_shift_id bigint, p_customer_name text, p_customer_phone text, p_subtotal numeric, p_discount_pct numeric, p_items jsonb, p_table_id bigint, p_staff_member_id bigint DEFAULT NULL::bigint, p_existing_order_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select * into v_business from businesses where id = v_business_id;

  if p_existing_order_id is not null then
    select * into v_existing from orders where id = p_existing_order_id and business_id = v_business_id and payment_status = 'unpaid';
    if v_existing is null then
      raise exception 'order not found or already paid';
    end if;
    v_order_id := p_existing_order_id;
    v_discount_pct := v_existing.discount_pct;
    v_new_subtotal := v_existing.subtotal + p_subtotal;

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
    select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
      from compute_vat_split(
        p_subtotal - v_discount_amount,
        case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
        coalesce(v_business.prices_include_vat, true)
      ) cvs;

    insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone,
      subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid,
      channel, table_id, staff_member_id, payment_status)
    values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone,
      p_subtotal, v_discount_pct, v_discount_amount, v_vat, v_total, null, null, p_client_order_uuid,
      'dine_in', p_table_id, p_staff_member_id, 'unpaid')
    returning id into v_order_id;

    update restaurant_tables set status = 'serving', active_order_id = v_order_id
      where id = p_table_id and business_id = v_business_id;
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into order_items (order_id, menu_item_id, service_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers)
    values (
      v_order_id, nullif(item->>'menu_item_id','')::bigint, nullif(item->>'service_id','')::bigint,
      (item->>'qty')::numeric, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers'
    );

    v_menu_item_id := nullif(item->>'menu_item_id','')::bigint;
    v_qty := (item->>'qty')::numeric;
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

  return v_order_id;
end;
$function$;
