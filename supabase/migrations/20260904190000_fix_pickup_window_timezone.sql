-- The online store refused every scheduled pickup time.
--
-- opening_time and closing_time are LOCAL wall-clock times, but the check
-- compared them against current_date and now()::time, which Postgres
-- evaluates in the database's timezone — UTC here. Every window was three
-- hours adrift, and an overnight branch was refused outright at any hour.
--
-- The branch that reported it opens 23:00 and closes 06:00. At 12:52 local
-- the old code placed the close at today 06:00 UTC: already in the past,
-- because its rollover to the next day only fired once now()::time was
-- past the opening — which, being UTC, it never was. So every future
-- pickup time compared as "after closing".
--
-- Three fixes: do the arithmetic in Asia/Riyadh, roll an overnight window
-- correctly from either side of midnight, and reject times BEFORE opening
-- — a bound that was missing, so a time inside the shut hours passed as
-- long as it cleared the prep time. Per-weekday overrides are consulted
-- too, so the server agrees with the picker the customer was shown.

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
  v_base_price numeric;
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
  v_opens_at timestamptz;
  v_now_local timestamp;
  v_day date;
  v_open time;
  v_close time;
  v_day_closed boolean := false;
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

  if p_payment_method = 'cash' and not coalesce(v_business.online_cod_enabled, true) then
    raise exception 'الدفع عند الاستلام غير متاح حاليًا لهذا المتجر';
  end if;
  if p_payment_method not in ('cash', 'card') then
    raise exception 'طريقة دفع غير صالحة';
  end if;
  -- Two independent gates, and both have to pass. The gateway check asks
  -- whether card payment CAN work; the switch asks whether the store wants
  -- to offer it. Collapsing them would mean connecting a gateway silently
  -- turns the option on for everyone who ever connected one.
  if p_payment_method = 'card' and not coalesce(v_business.online_card_enabled, true) then
    raise exception 'الدفع الإلكتروني غير متاح حاليًا لهذا المتجر';
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

    -- Opening hours are LOCAL wall-clock times. The old check compared them
    -- against current_date and now()::time, which Postgres evaluates in the
    -- database's timezone (UTC here) — so every window was off by the
    -- Riyadh offset, and an overnight branch was refused outright.
    --
    -- Worked example, the branch that reported this: opens 23:00, closes
    -- 06:00. At 12:52 local the old code computed the close as today 06:00
    -- UTC, three hours adrift AND already in the past, because its rollover
    -- only fired when now()::time was already past the opening. Every
    -- future pickup time was therefore "after closing". The branch could
    -- never take a scheduled order, at any hour.
    v_now_local := now() at time zone 'Asia/Riyadh';
    v_day := v_now_local::date;

    -- A per-weekday override wins over the branch default, so the server
    -- agrees with the picker the customer was just shown. extract(dow)
    -- matches branch_weekly_hours.weekday: 0 = Sunday.
    begin
      select bwh.opening_time, bwh.closing_time, bwh.is_closed
        into v_open, v_close, v_day_closed
      from branch_weekly_hours bwh
      where bwh.branch_id = v_branch.id
        and bwh.weekday = extract(dow from v_day)::smallint;
    exception when undefined_table then
      v_open := null; v_close := null; v_day_closed := false;
    end;

    if v_day_closed then
      raise exception 'الفرع مغلق في هذا اليوم';
    end if;
    if v_open is null or v_close is null then
      v_open := v_branch.opening_time;
      v_close := v_branch.closing_time;
    end if;

    if v_open is not null and v_close is not null then
      v_opens_at  := (v_day + v_open)  at time zone 'Asia/Riyadh';
      v_closes_at := (v_day + v_close) at time zone 'Asia/Riyadh';

      -- An overnight window closes on the day AFTER it opens.
      if v_close <= v_open then
        v_closes_at := v_closes_at + interval '1 day';
        -- ...and if we are currently in the small hours before that close,
        -- the window we are inside began YESTERDAY, not tonight.
        if v_now_local::time < v_close then
          v_opens_at  := v_opens_at  - interval '1 day';
          v_closes_at := v_closes_at - interval '1 day';
        end if;
      end if;

      -- Never earlier than the kitchen can have it ready, never before the
      -- branch opens, never after it closes. The opening bound was missing
      -- entirely before: a time inside the shut hours passed as long as it
      -- cleared the prep time.
      if v_scheduled_for < greatest(v_earliest - interval '60 seconds', v_opens_at)
         or v_scheduled_for > v_closes_at then
        raise exception 'وقت الاستلام المختار غير متاح';
      end if;
    else
      -- No hours configured has always meant "always open"; only the prep
      -- time applies.
      if v_scheduled_for < v_earliest - interval '60 seconds' then
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
    'unpaid',
    0,
    0, 0, 0, 0, 0, 0,
    p_customer_name, p_customer_phone, v_customer_id, p_delivery_address, p_note,
    p_customer_lat, p_customer_lng, v_scheduled_for,
    v_uuid
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price, online_price, business_id, cost_mode, total_pieces into v_menu_item from menu_items
      where id = (v_item->>'menu_item_id')::bigint and business_id = v_business.id and active = true;
    if not found then
      raise exception 'صنف غير متاح: %', (v_item->>'menu_item_id');
    end if;

    v_base_price := coalesce(v_menu_item.online_price, v_menu_item.price);
    v_line_price := v_base_price;
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
        v_order_id, v_menu_item.id, (v_item->>'qty')::int, v_base_price, v_line_mods,
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
    cash_amount = 0
    where id = v_order_id;

  if p_payment_method <> 'card' then
    update businesses set online_order_free_count = online_order_free_count + 1 where id = v_business.id;
  end if;

  return query select v_order_id, v_total, o.tracking_token, o.scheduled_for from orders o where o.id = v_order_id;
end;
$$;
