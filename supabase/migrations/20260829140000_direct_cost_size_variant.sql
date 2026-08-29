-- بوكس ورق عنب (id 52) is cost_mode='direct' but has a "كبير" size MODIFIER
-- that changes price (49 -> 99) without ever changing cost — a flat
-- direct_cost can't represent that. Rather than forcing it through the
-- box-builder UI (cost_mode='box') just to get a size-aware cost, this adds
-- one optional large-size override and picks it by comparing the line's
-- actual unit_price against the item's own base price — a direct, minimal
-- fix for the one real case of this pattern today, verified against
-- AnoobRes's real per-order numbers (medium 16.60 = 15pc*0.70 + 6.10 pkg;
-- large 31.70 = 36pc*0.70 + 6.50 pkg).
alter table menu_items add column direct_cost_large numeric;
update menu_items set direct_cost_large = 31.70 where id = 52;

create or replace function compute_line_cost(p_menu_item_id bigint, p_qty numeric, p_box_selections jsonb, p_unit_price numeric default null)
returns numeric
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_menu_item record;
  v_recipe_cost numeric := 0;
  v_box_cost numeric := 0;
  v_pieces_per_selection int;
  v_direct_cost numeric;
  sel jsonb;
  v_eligible record;
begin
  select * into v_menu_item from menu_items where id = p_menu_item_id;
  if v_menu_item is null then
    return 0;
  end if;

  select coalesce(sum(
    (case
      when rl.unit = si.unit then decrypt_recipe_qty(rl.qty)
      when rl.unit = 'g' and si.unit = 'kg' then decrypt_recipe_qty(rl.qty) / 1000
      when rl.unit = 'kg' and si.unit = 'g' then decrypt_recipe_qty(rl.qty) * 1000
      else decrypt_recipe_qty(rl.qty)
    end) * si.unit_cost
  ), 0) into v_recipe_cost
  from menu_item_recipe_lines rl join stock_items si on si.id = rl.stock_item_id
  where rl.menu_item_id = p_menu_item_id;

  if v_menu_item.cost_mode = 'direct' then
    v_direct_cost := coalesce(v_menu_item.direct_cost, 0);
    if v_menu_item.direct_cost_large is not null and p_unit_price is not null
       and v_menu_item.price > 0 and p_unit_price > v_menu_item.price * 1.3 then
      v_direct_cost := v_menu_item.direct_cost_large;
    end if;
    return round(v_direct_cost * p_qty, 6);
  elsif v_menu_item.cost_mode = 'recipe' then
    return round(v_recipe_cost * p_qty, 6);
  elsif v_menu_item.cost_mode = 'box' then
    v_pieces_per_selection := coalesce(v_menu_item.box_pieces_per_selection, 1);
    for sel in select * from jsonb_array_elements(coalesce(p_box_selections, '[]'::jsonb)) loop
      select coalesce(si.unit_cost, e.extra_cost, 0) as piece_cost into v_eligible
        from menu_item_box_eligible_items e
        left join stock_items si on si.id = e.stock_item_id
        where e.id = nullif(sel->>'eligible_item_id','')::bigint and e.menu_item_id = p_menu_item_id;
      if found then
        v_box_cost := v_box_cost + (sel->>'qty')::numeric * v_pieces_per_selection * v_eligible.piece_cost;
      end if;
    end loop;
    return round((v_recipe_cost + v_box_cost + coalesce(v_menu_item.box_packaging_cost, 0)) * p_qty, 6);
  end if;
  return 0;
end;
$$;

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
  p_platform_invoice_last4 text default null
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

  v_auto_ready := case p_channel
    when 'dine_in' then v_business.auto_ready_dine_in
    when 'pickup' then v_business.auto_ready_pickup
    when 'delivery' then v_business.auto_ready_delivery_platform
    else false
  end;

  insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone,
    subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid,
    channel, delivery_platform_id, table_id, staff_member_id, platform_invoice_last4,
    ready_at, prep_duration_seconds, delivered_at)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone,
    p_subtotal, p_discount_pct, p_discount_amount, v_vat, v_total, p_payment_method, p_cash_amount, p_client_order_uuid,
    p_channel, p_delivery_platform_id, p_table_id, p_staff_member_id, p_platform_invoice_last4,
    case when v_auto_ready then now() else null end,
    case when v_auto_ready then 0 else null end,
    case when v_auto_ready and p_channel = 'delivery' then now() else null end)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    v_menu_item_id := nullif(item->>'menu_item_id','')::bigint;
    v_qty := (item->>'qty')::numeric;

    insert into order_items (order_id, menu_item_id, service_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers, cost_at_sale)
    values (
      v_order_id, v_menu_item_id, nullif(item->>'service_id','')::bigint,
      v_qty, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers',
      case when v_menu_item_id is not null then compute_line_cost(v_menu_item_id, v_qty, item->'box_selections', (item->>'unit_price')::numeric) else null end
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
  p_existing_order_id bigint default null
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
      channel, table_id, staff_member_id, payment_status, ready_at, prep_duration_seconds)
    values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone,
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

    insert into order_items (order_id, menu_item_id, service_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers, cost_at_sale)
    values (
      v_order_id, v_menu_item_id, nullif(item->>'service_id','')::bigint,
      v_qty, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers',
      case when v_menu_item_id is not null then compute_line_cost(v_menu_item_id, v_qty, item->'box_selections', (item->>'unit_price')::numeric) else null end
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

  return v_order_id;
end;
$$;

create or replace function submit_online_order(p_business_slug text, p_customer_name text, p_customer_phone text, p_channel text, p_delivery_address text, p_note text, p_items jsonb, p_branch_id bigint default null, p_customer_lat numeric default null, p_customer_lng numeric default null, p_scheduled_for timestamptz default null, p_client_order_uuid uuid default null, p_payment_method text default 'cash')
returns table(order_id bigint, order_total numeric, tracking_token uuid, scheduled_for timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business record;
  v_branch record;
  v_customer_id bigint;
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_vat numeric;
  v_total numeric;
  v_order_id bigint;
  v_item jsonb;
  v_menu_item record;
  v_line_price numeric;
  v_line_mods numeric;
  v_line_label text;
  v_opt jsonb;
  v_option record;
  v_box_qty int;
  v_box_total_pieces int;
  v_box_eligible record;
  v_box_labels text[];
  v_scheduled_for timestamptz := p_scheduled_for;
  v_earliest timestamptz;
  v_closes_at timestamptz;
  v_uuid uuid;
  v_recent_count int;
begin
  select * into v_business from businesses where online_menu_slug = p_business_slug and online_ordering_enabled = true;
  if not found then
    raise exception 'المطعم غير متاح للطلب الإلكتروني حاليًا';
  end if;

  if p_client_order_uuid is not null then
    return query
      select o.id, o.total, o.tracking_token, o.scheduled_for
      from orders o
      where o.client_order_uuid = p_client_order_uuid;
    if found then
      return;
    end if;
  end if;

  if v_business.verification_status = 'pending' then
    raise exception 'هذا المتجر قيد المراجعة من فريق ركين حالياً — يتفعّل قريباً';
  elsif v_business.verification_status = 'rejected' then
    raise exception 'المطعم غير متاح للطلب الإلكتروني حاليًا';
  end if;

  if not v_business.online_subscribed and v_business.online_order_free_count >= 350 then
    raise exception 'انتهت الفترة التجريبية المجانية لهذا المتجر — تواصل مع صاحب المطعم';
  end if;

  if not check_rate_limit('online_order_ip:' || client_ip(), 30, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;
  if p_customer_phone is not null then
    if not check_rate_limit('online_order_phone:' || p_customer_phone || ':' || v_business.id, 10, 600) then
      raise exception 'محاولات كثيرة على هذا الرقم، حاول بعد شوي';
    end if;
  end if;

  if p_channel not in ('delivery', 'pickup') then
    raise exception 'نوع طلب غير صالح';
  end if;
  if p_channel = 'delivery' and not v_business.online_offers_delivery then
    raise exception 'التوصيل غير متاح حاليًا لهذا المطعم';
  end if;
  if p_channel = 'pickup' and not v_business.online_offers_pickup then
    raise exception 'الاستلام غير متاح حاليًا لهذا المطعم';
  end if;
  if p_customer_phone is null or length(trim(p_customer_phone)) < 6 then
    raise exception 'رقم جوال غير صالح';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'السلة فارغة';
  end if;

  if p_payment_method not in ('cash', 'card') then
    raise exception 'طريقة دفع غير صالحة';
  end if;
  if p_payment_method = 'card' and not exists (
    select 1 from business_payment_gateways
    where business_id = v_business.id and provider = 'geidea' and connected = true
  ) then
    raise exception 'الدفع بالبطاقة غير متاح لهذا المطعم';
  end if;

  select count(*) into v_recent_count from orders
    where business_id = v_business.id and customer_phone = p_customer_phone
      and source = 'online' and created_at > now() - interval '20 seconds';
  if v_recent_count >= 2 then
    raise exception 'فيه طلب لك قبل شوي، لحظات وبنقبله — ما تحتاج ترسل مرة ثانية';
  end if;

  if p_branch_id is not null then
    select * into v_branch from branches where id = p_branch_id and business_id = v_business.id;
    if v_branch.id is null then
      raise exception 'الفرع المحدد غير صالح';
    end if;
  else
    select * into v_branch from branches where business_id = v_business.id order by id limit 1;
  end if;
  if v_branch.id is null then
    raise exception 'المطعم بدون فرع مسجّل';
  end if;

  if p_channel = 'delivery' then
    v_scheduled_for := null;
  elsif p_channel = 'pickup' and v_scheduled_for is not null then
    v_earliest := now() + make_interval(mins => coalesce(v_business.online_pickup_prep_minutes, 20));
    if v_branch.opening_time is not null and v_branch.closing_time is not null then
      v_closes_at := (current_date + v_branch.closing_time)::timestamptz;
      if v_branch.closing_time < v_branch.opening_time and now()::time >= v_branch.opening_time then
        v_closes_at := v_closes_at + interval '1 day';
      end if;
      if v_scheduled_for < v_earliest - interval '60 seconds' or v_scheduled_for > v_closes_at then
        raise exception 'وقت الاستلام المختار غير متاح';
      end if;
    end if;
  end if;

  select id into v_customer_id from customers
    where business_id = v_business.id and phone = p_customer_phone;
  if v_customer_id is null then
    insert into customers (business_id, name, phone) values (v_business.id, p_customer_name, p_customer_phone)
      returning id into v_customer_id;
  end if;

  if p_channel = 'delivery' then
    v_delivery_fee := coalesce(v_business.online_delivery_fee, 0);
  end if;

  v_uuid := coalesce(p_client_order_uuid, gen_random_uuid());

  insert into orders (
    business_id, branch_id, cashier_id, channel, source, status, payment_method, payment_status, cash_amount,
    subtotal, discount_pct, discount_amount, vat_amount, total, delivery_fee,
    customer_name, customer_phone, customer_id, delivery_address, online_customer_note,
    customer_lat, customer_lng, scheduled_for,
    client_order_uuid
  ) values (
    v_business.id, v_branch.id, null, p_channel, 'online',
    case when p_payment_method = 'card' then 'awaiting_payment' else 'pending' end,
    p_payment_method,
    case when p_payment_method = 'card' then 'unpaid' else 'paid' end,
    0,
    0, 0, 0, 0, 0, 0,
    p_customer_name, p_customer_phone, v_customer_id, p_delivery_address, p_note,
    p_customer_lat, p_customer_lng, v_scheduled_for,
    v_uuid
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price, business_id, cost_mode, total_pieces into v_menu_item from menu_items
      where id = (v_item->>'menu_item_id')::bigint and business_id = v_business.id and active = true;
    if not found then
      raise exception 'صنف غير متاح: %', (v_item->>'menu_item_id');
    end if;

    v_line_price := v_menu_item.price;
    v_line_mods := 0;
    v_line_label := v_menu_item.name;

    if v_menu_item.cost_mode = 'box' and v_item ? 'box_selections' then
      v_box_total_pieces := 0;
      v_box_labels := array[]::text[];
      for v_opt in select * from jsonb_array_elements(v_item->'box_selections')
      loop
        v_box_qty := (v_opt->>'qty')::int;
        if v_box_qty > 0 then
          select e.id, e.name into v_box_eligible from menu_item_box_eligible_items e
            where e.id = (v_opt->>'eligible_item_id')::bigint and e.menu_item_id = v_menu_item.id;
          if found then
            v_box_total_pieces := v_box_total_pieces + v_box_qty;
            v_box_labels := array_append(v_box_labels, v_box_eligible.name || ' ×' || v_box_qty);
          end if;
        end if;
      end loop;
      if v_menu_item.total_pieces is not null and v_box_total_pieces <> v_menu_item.total_pieces then
        raise exception 'تركيبة البوكس غير مكتملة: %', v_menu_item.name;
      end if;
      if array_length(v_box_labels, 1) > 0 then
        v_line_label := v_menu_item.name || ' — ' || array_to_string(v_box_labels, '، ');
      end if;
    elsif v_item ? 'selected_options' then
      for v_opt in select * from jsonb_array_elements(v_item->'selected_options')
      loop
        select o.id, o.name, o.price_delta into v_option from modifier_options o
          join modifier_groups g on g.id = o.group_id
          join menu_item_modifier_groups mig on mig.modifier_group_id = g.id
          where o.id = (v_opt->>'option_id')::bigint
            and g.id = (v_opt->>'group_id')::bigint
            and mig.menu_item_id = v_menu_item.id
            and g.business_id = v_business.id;
        if found then
          v_line_price := v_line_price + coalesce(v_option.price_delta, 0);
          v_line_mods := v_line_mods + coalesce(v_option.price_delta, 0);
          v_line_label := v_line_label || ' — ' || v_option.name;
        end if;
      end loop;
    end if;

    insert into order_items (order_id, menu_item_id, qty, unit_price, modifiers_total, line_total, selected_modifiers, note, cost_at_sale)
      values (
        v_order_id, v_menu_item.id, (v_item->>'qty')::int, v_menu_item.price, v_line_mods,
        v_line_price * (v_item->>'qty')::int,
        jsonb_build_array(jsonb_build_object('text', v_line_label)),
        v_item->>'note',
        compute_line_cost(v_menu_item.id, (v_item->>'qty')::int, v_item->'box_selections', v_line_price)
      );
    v_subtotal := v_subtotal + v_line_price * (v_item->>'qty')::int;
  end loop;

  select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
    from compute_vat_split(
      v_subtotal + v_delivery_fee,
      case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
      coalesce(v_business.prices_include_vat, true)
    ) cvs;

  update orders set
    subtotal = v_subtotal, vat_amount = v_vat, total = v_total, delivery_fee = v_delivery_fee,
    cash_amount = case when p_payment_method = 'card' then 0 else v_total end
    where id = v_order_id;

  if p_payment_method <> 'card' then
    update businesses set online_order_free_count = online_order_free_count + 1 where id = v_business.id;
  end if;

  return query select v_order_id, v_total, o.tracking_token, o.scheduled_for from orders o where o.id = v_order_id;
end;
$$;
