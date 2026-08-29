-- Second loyalty system type: "visits" (stamp-card — buy N, get one free),
-- as an alternative to the existing points system. Owner picks one per
-- business in Settings → الولاء; the customer-facing card renders whichever
-- is active.

alter table businesses add column loyalty_system_type text not null default 'points'
  check (loyalty_system_type in ('points','visits'));
alter table businesses add column loyalty_visits_threshold int not null default 5
  check (loyalty_visits_threshold > 0);
alter table businesses add column loyalty_reward_label text not null default 'مكافأة مجانية';
alter table businesses add column loyalty_icon_style text not null default 'generic'
  check (loyalty_icon_style in ('generic','coffee','burger','pizza','pastry','dessert'));

alter table customers add column loyalty_visits int not null default 0;
alter table customers add column loyalty_free_rewards int not null default 0;

-- return-type change (new columns) needs a drop first — see the earlier
-- get_loyalty_card migration hotfix for why create-or-replace can't do this.
drop function if exists get_loyalty_card(uuid);

create function get_loyalty_card(p_token uuid)
returns table(
  customer_name text, loyalty_points numeric, business_name text,
  logo_url text, banner_url text, accent_color text,
  loyalty_system_type text, loyalty_visits int, loyalty_visits_threshold int,
  loyalty_reward_label text, loyalty_icon_style text, loyalty_free_rewards int
)
language sql
security definer
stable
set search_path = public
as $$
  select c.name, c.loyalty_points, b.name, b.loyalty_logo_url, b.loyalty_banner_url, b.loyalty_accent_color,
    b.loyalty_system_type, c.loyalty_visits, b.loyalty_visits_threshold, b.loyalty_reward_label, b.loyalty_icon_style, c.loyalty_free_rewards
  from customers c join businesses b on b.id = c.business_id
  where c.public_token = p_token;
$$;

-- complete_pos_order: earn visits instead of points when the business is in
-- visits mode. Reaching the threshold resets the visit counter and grants
-- one free_rewards credit (redemption flow is a separate follow-up — this
-- migration only makes earning real).
create or replace function complete_pos_order(
  p_client_order_uuid uuid, p_branch_id bigint, p_shift_id bigint,
  p_customer_name text, p_customer_phone text,
  p_subtotal numeric, p_discount_pct numeric, p_discount_amount numeric, p_vat_amount numeric, p_total numeric,
  p_payment_method text, p_cash_amount numeric,
  p_items jsonb,
  p_channel text default 'dine_in',
  p_delivery_platform_id bigint default null,
  p_table_id bigint default null,
  p_staff_member_id bigint default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_order_id bigint;
  v_business_id bigint := current_business_id();
  v_customer_id bigint;
  v_points_balance numeric;
  v_points_to_spend numeric;
  v_points_divisor numeric;
  v_points_earned numeric;
  v_system_type text;
  v_visits_threshold int;
  v_visits_after int;
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

  select coalesce(sum((elem->>'points_cost')::numeric), 0) into v_points_to_spend
    from jsonb_array_elements(p_items) as elem
    where coalesce((elem->>'is_points_redemption')::boolean, false);

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

  if v_customer_id is not null then
    select loyalty_system_type into v_system_type from businesses where id = v_business_id;

    if v_system_type = 'visits' then
      select loyalty_visits_threshold into v_visits_threshold from businesses where id = v_business_id;
      update customers set loyalty_visits = loyalty_visits + 1 where id = v_customer_id
        returning loyalty_visits into v_visits_after;
      if v_visits_after >= v_visits_threshold then
        update customers set loyalty_visits = 0, loyalty_free_rewards = loyalty_free_rewards + 1 where id = v_customer_id;
      end if;
    else
      select loyalty_points_divisor into v_points_divisor from businesses where id = v_business_id;
      v_points_earned := floor(p_total / v_points_divisor);
      if v_points_earned > 0 then
        update customers set loyalty_points = loyalty_points + v_points_earned where id = v_customer_id;
      end if;
    end if;
  end if;

  return v_order_id;
end;
$$;
