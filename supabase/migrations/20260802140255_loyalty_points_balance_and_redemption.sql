-- Loyalty points become a real, stored, decrementable balance (earned
-- automatically on every order tied to a customer, spent on real
-- redemptions) instead of a pure spend/divisor display computation.
alter table customers add column loyalty_points numeric not null default 0;

-- Unrelated to the sequential id on purpose: this is what the digital
-- loyalty-card link uses, so a customer's card URL isn't just "guess the
-- next number" to see someone else's name/points.
alter table customers add column public_token uuid not null default gen_random_uuid() unique;

-- Optional: a menu item can be redeemable for a fixed points price ("500
-- points = a burger"). Null means not redeemable via points at all.
alter table menu_items add column points_redeem_price numeric check (points_redeem_price is null or points_redeem_price > 0);

-- Marks which order_items lines were paid with points (line_total is 0 for
-- these — money-wise they're free; points_spent is what was actually
-- deducted from the customer's balance for that line).
alter table order_items add column is_points_redemption boolean not null default false;
alter table order_items add column points_spent numeric not null default 0;

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
  v_points_balance numeric;
  v_points_to_spend numeric;
  v_points_divisor numeric;
  v_points_earned numeric;
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

  -- points redemption: verify + deduct before the order is written, so an
  -- insufficient balance aborts the whole order (nothing partially applied)
  select coalesce(sum((item->>'points_cost')::numeric), 0) into v_points_to_spend
    from jsonb_array_elements(p_items) as item
    where coalesce((item->>'is_points_redemption')::boolean, false);

  if v_points_to_spend > 0 then
    if v_customer_id is null then
      raise exception 'no customer linked for points redemption';
    end if;
    select loyalty_points into v_points_balance from customers where id = v_customer_id;
    if v_points_balance < v_points_to_spend then
      raise exception 'insufficient points';
    end if;
    update customers set loyalty_points = loyalty_points - v_points_to_spend where id = v_customer_id;
  end if;

  insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone, customer_id,
    subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid,
    channel, delivery_platform_id, table_id, staff_member_id)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone, v_customer_id,
    p_subtotal, p_discount_pct, p_discount_amount, p_vat_amount, p_total, p_payment_method, p_cash_amount, p_client_order_uuid,
    p_channel, p_delivery_platform_id, p_table_id, p_staff_member_id)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into order_items (order_id, menu_item_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers,
      is_points_redemption, points_spent)
    values (
      v_order_id, (item->>'menu_item_id')::bigint, (item->>'qty')::numeric, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers',
      coalesce((item->>'is_points_redemption')::boolean, false), coalesce((item->>'points_cost')::numeric, 0)
    );

    for dec in select * from jsonb_array_elements(coalesce(item->'stock_decrements', '[]'::jsonb)) loop
      update stock_items set qty_on_hand = qty_on_hand - (dec->>'qty')::numeric, updated_at = now()
      where id = (dec->>'stock_item_id')::bigint;
    end loop;
  end loop;

  -- earn points on whatever was actually paid (p_total already excludes
  -- redeemed lines, since the client prices those at 0)
  if v_customer_id is not null then
    select loyalty_points_divisor into v_points_divisor from businesses where id = v_business_id;
    v_points_earned := floor(p_total / v_points_divisor);
    if v_points_earned > 0 then
      update customers set loyalty_points = loyalty_points + v_points_earned where id = v_customer_id;
    end if;
  end if;

  return v_order_id;
end;
$$;

-- Powers the public digital loyalty-card page (app/loyalty-card/[token]) —
-- no login exists for customers, so this is the one deliberately narrow,
-- anon-callable read: exactly 3 harmless fields, matched by an unguessable
-- token, nothing else about the business or its other customers is exposed.
create or replace function get_loyalty_card(p_token uuid)
returns table(customer_name text, loyalty_points numeric, business_name text)
language sql
security definer
stable
set search_path = public
as $$
  select c.name, c.loyalty_points, b.name
  from customers c join businesses b on b.id = c.business_id
  where c.public_token = p_token;
$$;
grant execute on function get_loyalty_card(uuid) to anon;
