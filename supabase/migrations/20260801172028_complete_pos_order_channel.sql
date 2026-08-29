-- complete_pos_order() gains channel/delivery_platform_id/table_id. Dropping
-- and recreating (not just CREATE OR REPLACE) since the parameter list
-- changes — avoids ending up with two overloads side by side.
drop function if exists complete_pos_order(uuid, bigint, bigint, text, text, numeric, numeric, numeric, numeric, numeric, text, numeric, jsonb);

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
  p_staff_member_id bigint default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_business_id bigint := current_business_id();
  item jsonb;
  dec jsonb;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select id into v_order_id from orders where client_order_uuid = p_client_order_uuid;
  if v_order_id is not null then
    return v_order_id;
  end if;

  insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone,
    subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid,
    channel, delivery_platform_id, table_id, staff_member_id)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone,
    p_subtotal, p_discount_pct, p_discount_amount, p_vat_amount, p_total, p_payment_method, p_cash_amount, p_client_order_uuid,
    p_channel, p_delivery_platform_id, p_table_id, p_staff_member_id)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into order_items (order_id, menu_item_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers)
    values (
      v_order_id, (item->>'menu_item_id')::bigint, (item->>'qty')::numeric, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers'
    );

    for dec in select * from jsonb_array_elements(coalesce(item->'stock_decrements', '[]'::jsonb)) loop
      update stock_items set qty_on_hand = qty_on_hand - (dec->>'qty')::numeric, updated_at = now()
      where id = (dec->>'stock_item_id')::bigint;
    end loop;
  end loop;

  return v_order_id;
end;
$$;
