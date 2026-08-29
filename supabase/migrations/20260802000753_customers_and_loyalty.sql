-- Real customers + loyalty. Customers are only ever created server-side
-- inside complete_pos_order() (find-or-create by phone), same audited-path
-- reasoning as orders/order_items — no direct client insert policy. Loyalty
-- points aren't a stored balance (nothing redeems them yet — the POS has no
-- redemption UI), they're a live computation (spend / divisor), same as the
-- prototype's original design; only the divisor itself needs to persist.

create table customers (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);
create unique index customers_business_phone_idx on customers(business_id, phone) where phone is not null;
create index customers_business_id_idx on customers(business_id);

alter table orders add column customer_id bigint references customers(id);
create index orders_customer_id_idx on orders(customer_id);

alter table businesses add column loyalty_points_divisor numeric not null default 10;

alter table customers enable row level security;
create policy customers_select on customers for select
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:customers') or has_permission('screen:loyalty')));
-- no insert/update/delete policy — customers are only ever written by
-- complete_pos_order() (security definer, bypasses RLS for its own writes).

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
  v_customer_id bigint;
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

  if p_customer_phone is not null and length(trim(p_customer_phone)) > 0 then
    select id into v_customer_id from customers
      where business_id = v_business_id and phone = p_customer_phone;
    if v_customer_id is null then
      insert into customers (business_id, name, phone)
      values (v_business_id, coalesce(nullif(trim(p_customer_name), ''), p_customer_phone), p_customer_phone)
      returning id into v_customer_id;
    elsif p_customer_name is not null and length(trim(p_customer_name)) > 0 then
      update customers set name = p_customer_name where id = v_customer_id;
    end if;
  end if;

  insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone, customer_id,
    subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid,
    channel, delivery_platform_id, table_id, staff_member_id)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone, v_customer_id,
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
