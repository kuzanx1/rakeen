-- Lets a merchant curate the online storefront's catalog independently of
-- the POS cashier's product grid: add an item that only shows online, hide
-- a POS item from online without deactivating it (deactivating disables it
-- everywhere, including cost/inventory tracking), or vice versa. Default
-- true on both preserves today's behavior for every existing business/item
-- (online mirrors POS exactly, same as before this migration) — going
-- forward, the dashboard's add-item forms decide what to pass per-channel,
-- not this column default.
alter table menu_items add column if not exists visible_online boolean not null default true;
alter table menu_items add column if not exists visible_pos boolean not null default true;

-- The anon storefront read policy only ever checked active — a merchant
-- flipping visible_online off had no actual effect without this.
drop policy if exists "public menu read for online ordering" on menu_items;
create policy "public menu read for online ordering" on menu_items for select
  using (
    active = true
    and visible_online = true
    and exists (select 1 from businesses b where b.id = menu_items.business_id and b.online_ordering_enabled = true)
  );

-- submit_online_order is SECURITY DEFINER and anon-callable directly (not
-- just via the storefront UI), so the visible_online gate has to be
-- re-checked here too, exactly like the RLS policy above — otherwise a
-- caller who already knows a menu_item_id could still order an
-- online-hidden item straight through the RPC. Byte-identical to
-- 20260829210000's body except this one WHERE clause.
create or replace function public.submit_online_order(p_business_slug text, p_customer_name text, p_customer_phone text, p_channel text, p_delivery_address text, p_note text, p_items jsonb, p_branch_id bigint DEFAULT NULL::bigint, p_customer_lat numeric DEFAULT NULL::numeric, p_customer_lng numeric DEFAULT NULL::numeric, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_client_order_uuid uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text)
 RETURNS TABLE(order_id bigint, order_total numeric, tracking_token uuid, scheduled_for timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_qty int;
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
  select * into v_business from businesses
    where online_menu_slug = p_business_slug and online_ordering_enabled = true and is_active = true;
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
      where id = (v_item->>'menu_item_id')::bigint and business_id = v_business.id and active = true and visible_online = true;
    if not found then
      raise exception 'صنف غير متاح: %', (v_item->>'menu_item_id');
    end if;

    v_qty := nullif(v_item->>'qty', '')::int;
    if v_qty is null or v_qty <= 0 or v_qty > 50 then
      raise exception 'كمية غير صالحة';
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
        v_order_id, v_menu_item.id, v_qty, v_menu_item.price, v_line_mods,
        v_line_price * v_qty,
        jsonb_build_array(jsonb_build_object('text', v_line_label)),
        v_item->>'note',
        compute_line_cost(v_menu_item.id, v_qty, v_item->'box_selections', v_line_price)
      );
    v_subtotal := v_subtotal + v_line_price * v_qty;
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
$function$;
