-- Two real problems in how checkout decremented stock, both in the same
-- code path:
--
-- 1) SECURITY BUG: complete_pos_order/register_dine_in_order blindly ran
--    `update stock_items set qty_on_hand = qty_on_hand - X where id = Y`
--    using a client-supplied stock_item_id, with NO business_id check. Since
--    both functions are SECURITY DEFINER (they bypass RLS by design), any
--    authenticated pos:register session in ANY business could corrupt a
--    DIFFERENT business's inventory by crafting a checkout payload with
--    someone else's stock_item_id. Every decrement below is now scoped
--    `and business_id = v_business_id`.
--
-- 2) RECIPE PRIVACY: to compute those decrements at all, the POS client had
--    to read menu_item_recipe_lines, menu_item_box_default_mix and
--    stock_items.unit_cost/name directly — i.e. an owner's exact recipe and
--    ingredient costs, readable by any cashier's own authenticated session
--    (RLS grants pos:register SELECT there), regardless of the dashboard's
--    own view_profit gating (which only hides it from the UI, not the API).
--    That's real IP a lot of owners understandably won't type into any
--    system if staff can read it back out. Recipe-line and box-pick
--    decrements are now resolved SERVER-SIDE from the menu item's own stored
--    recipe — the client only ever sends menu_item_id + qty (which it needs
--    anyway) and, for a build-your-own box, which eligible-item ROW ids the
--    customer picked and how many pieces (already customer-facing, not
--    secret) — never a stock_item_id, a unit cost, or an ingredient name.
--
-- Stock-linked MODIFIER extras (e.g. "extra cheese") are left as-is for now
-- (still client-computed amounts) — a modifier's own name is customer-facing
-- already, a materially smaller exposure than a full recipe, and folding it
-- into the same server-side resolution is a reasonable follow-up rather than
-- something worth widening tonight's change for. The business_id scoping fix
-- above still fully applies to that path too.

create or replace function resolve_menu_item_recipe_decrements(p_menu_item_id bigint, p_line_qty numeric)
returns table (stock_item_id bigint, qty numeric)
language sql
security definer
stable
set search_path = public
as $$
  select rl.stock_item_id,
    (case
      when rl.unit = si.unit then rl.qty
      when rl.unit = 'g' and si.unit = 'kg' then rl.qty / 1000
      when rl.unit = 'kg' and si.unit = 'g' then rl.qty * 1000
      else rl.qty
    end) * p_line_qty as qty
  from menu_item_recipe_lines rl
  join stock_items si on si.id = rl.stock_item_id
  where rl.menu_item_id = p_menu_item_id;
$$;

-- p_selections is the customer's actual box picks this order — a jsonb array
-- of {eligible_item_id, qty}, eligible_item_id being menu_item_box_eligible_items.id
-- (a row the customer already saw and chose from at checkout, not a secret).
-- Each id is re-validated against p_menu_item_id here — a stale/tampered id
-- from a different item or business just resolves to no rows and is ignored,
-- never trusted blindly.
create or replace function resolve_box_selection_decrements(p_menu_item_id bigint, p_line_qty numeric, p_selections jsonb)
returns table (stock_item_id bigint, qty numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  sel jsonb;
  v_stock_item_id bigint;
  v_cost_mode text;
begin
  for sel in select * from jsonb_array_elements(coalesce(p_selections, '[]'::jsonb)) loop
    v_stock_item_id := null;
    v_cost_mode := null;
    select e.stock_item_id, e.cost_mode into v_stock_item_id, v_cost_mode
      from menu_item_box_eligible_items e
      where e.id = nullif(sel->>'eligible_item_id','')::bigint and e.menu_item_id = p_menu_item_id;
    if v_cost_mode = 'stock' and v_stock_item_id is not null then
      stock_item_id := v_stock_item_id;
      qty := (sel->>'qty')::numeric * p_line_qty;
      return next;
    end if;
  end loop;
end;
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
    end if;

    for dec in select * from jsonb_array_elements(coalesce(item->'stock_decrements', '[]'::jsonb)) loop
      update stock_items set qty_on_hand = qty_on_hand - (dec->>'qty')::numeric, updated_at = now()
      where id = (dec->>'stock_item_id')::bigint and business_id = v_business_id;
    end loop;
  end loop;

  return v_order_id;
end;
$function$;
