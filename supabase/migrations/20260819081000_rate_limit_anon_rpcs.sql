-- H3 continued — wires check_rate_limit()/client_ip() (20260819080000) into
-- every RPC granted to `anon`. These are the only real defense for this
-- class of endpoint: none of them pass through Rakeen's Cloudflare Worker,
-- so no edge-level rule (added separately, see the Next.js API routes)
-- reaches them at all.
--
-- Two key shapes are used, matched to what's actually being protected:
--  - IP-keyed: catches one attacker hammering many different targets
--    (many phone numbers / many tokens) from one source.
--  - identity-keyed (phone+business, or the capability token itself):
--    catches an attacker distributing the same attack across many IPs
--    against one target — which pure IP-limiting alone would miss.
-- Both are checked; either tripping blocks the call. Limits are generous
-- enough that a real customer never notices (a real diner does not place
-- 10 online orders to the same restaurant in 10 minutes, or refresh a
-- tracking page 30 times in a minute) while still shutting down a script.

drop function if exists submit_online_order(text, text, text, text, text, text, jsonb, bigint, numeric, numeric, timestamptz, uuid);
create or replace function submit_online_order(
  p_business_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_channel text,
  p_delivery_address text,
  p_note text,
  p_items jsonb,
  p_branch_id bigint default null,
  p_customer_lat numeric default null,
  p_customer_lng numeric default null,
  p_scheduled_for timestamptz default null,
  p_client_order_uuid uuid default null
)
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

  -- Rate limit: 30 order attempts/min from one IP (any target), and 10
  -- orders per 10 minutes from one phone number against one business —
  -- generous for a real household ordering for an event, hard-stops a
  -- script placing orders in a loop.
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
    business_id, branch_id, cashier_id, channel, source, status, payment_method, cash_amount,
    subtotal, discount_pct, discount_amount, vat_amount, total, delivery_fee,
    customer_name, customer_phone, customer_id, delivery_address, online_customer_note,
    customer_lat, customer_lng, scheduled_for,
    client_order_uuid
  ) values (
    v_business.id, v_branch.id, null, p_channel, 'online', 'pending', 'cash', 0,
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

    insert into order_items (order_id, menu_item_id, qty, unit_price, modifiers_total, line_total, selected_modifiers, note)
      values (
        v_order_id, v_menu_item.id, (v_item->>'qty')::int, v_menu_item.price, v_line_mods,
        v_line_price * (v_item->>'qty')::int,
        jsonb_build_array(jsonb_build_object('text', v_line_label)),
        v_item->>'note'
      );
    v_subtotal := v_subtotal + v_line_price * (v_item->>'qty')::int;
  end loop;

  select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
    from compute_vat_split(
      v_subtotal + v_delivery_fee,
      case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
      coalesce(v_business.prices_include_vat, true)
    ) cvs;

  update orders set subtotal = v_subtotal, vat_amount = v_vat, total = v_total, cash_amount = v_total, delivery_fee = v_delivery_fee
    where id = v_order_id;

  update businesses set online_order_free_count = online_order_free_count + 1 where id = v_business.id;

  return query select v_order_id, v_total, o.tracking_token, o.scheduled_for from orders o where o.id = v_order_id;
end;
$$;
grant execute on function submit_online_order(text, text, text, text, text, text, jsonb, bigint, numeric, numeric, timestamptz, uuid) to anon;


drop function if exists submit_public_reservation(text, text, text, bigint, timestamptz, bigint, numeric, numeric, text);
create or replace function submit_public_reservation(
  p_business_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_service_id bigint,
  p_reserved_for timestamptz,
  p_staff_member_id bigint default null,
  p_customer_lat numeric default null,
  p_customer_lng numeric default null,
  p_customer_address_text text default null
)
returns table(reservation_id bigint, service_name text, service_price numeric, duration_minutes int, reserved_for timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business record;
  v_service record;
  v_branch record;
  v_staff record;
  v_recent_count int;
  v_conflict_count int;
  v_reservation_id bigint;
  v_reserved_until timestamptz;
begin
  select * into v_business from businesses where online_menu_slug = p_business_slug and online_booking_enabled = true;
  if not found then
    raise exception 'هذا الرابط غير متاح للحجز حالياً';
  end if;

  if v_business.verification_status = 'pending' then
    raise exception 'هذا الحساب قيد المراجعة من فريق ركين حالياً — يتفعّل قريباً';
  elsif v_business.verification_status = 'rejected' then
    raise exception 'الحجز غير متاح حالياً لهذا الحساب';
  end if;

  -- Same shape as submit_online_order's throttle: IP-wide plus per-phone
  -- per-business, so neither a single-IP flood nor a distributed one
  -- targeting one business slips through.
  if not check_rate_limit('reservation_ip:' || client_ip(), 30, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;
  if p_customer_phone is not null then
    if not check_rate_limit('reservation_phone:' || p_customer_phone || ':' || v_business.id, 10, 600) then
      raise exception 'محاولات كثيرة على هذا الرقم، حاول بعد شوي';
    end if;
  end if;

  select * into v_service from services where id = p_service_id and business_id = v_business.id and active = true;
  if not found then
    raise exception 'الخدمة المطلوبة غير متاحة';
  end if;

  if p_customer_phone is null or length(trim(p_customer_phone)) < 6 then
    raise exception 'رقم جوال غير صالح';
  end if;
  if p_reserved_for <= now() then
    raise exception 'وقت الحجز يجب أن يكون بالمستقبل';
  end if;

  select count(*) into v_recent_count from table_reservations
    where business_id = v_business.id and customer_phone = p_customer_phone
      and created_at > now() - interval '20 seconds';
  if v_recent_count >= 2 then
    raise exception 'فيه حجز لك قبل شوي، لحظات وبنأكده — ما تحتاج ترسل مرة ثانية';
  end if;

  if p_staff_member_id is not null then
    select id into v_staff from staff_members
      where id = p_staff_member_id and business_id = v_business.id and active = true;
    if v_staff.id is null then
      raise exception 'الموظف المختار غير متاح';
    end if;
    if exists (select 1 from service_staff where service_id = p_service_id)
      and not exists (select 1 from service_staff where service_id = p_service_id and staff_member_id = p_staff_member_id) then
      raise exception 'هذا الموظف لا يقدّم هذي الخدمة';
    end if;
  end if;

  v_reserved_until := p_reserved_for + (v_service.duration_minutes * interval '1 minute');

  if p_staff_member_id is not null then
    select count(*) into v_conflict_count from table_reservations tr
      where tr.business_id = v_business.id and tr.staff_member_id = p_staff_member_id
        and tr.status = 'upcoming'
        and tr.reserved_for < v_reserved_until
        and tr.reserved_until > p_reserved_for;
    if v_conflict_count > 0 then
      raise exception 'هذا الموعد محجوز عند هذا الموظف — اختر وقتاً آخر';
    end if;
  end if;

  select id into v_branch from branches where business_id = v_business.id order by id limit 1;
  if v_branch.id is null then
    raise exception 'المنشأة بدون فرع مسجّل';
  end if;

  insert into table_reservations (
    business_id, branch_id, table_id, customer_name, customer_phone,
    party_size, reserved_for, status, staff_member_id, service_id, duration_minutes, reserved_until,
    customer_lat, customer_lng, customer_address_text
  ) values (
    v_business.id, v_branch.id, null, p_customer_name, p_customer_phone,
    1, p_reserved_for, 'upcoming', p_staff_member_id, p_service_id, v_service.duration_minutes, v_reserved_until,
    p_customer_lat, p_customer_lng, p_customer_address_text
  ) returning id into v_reservation_id;

  return query select v_reservation_id, v_service.name, v_service.price, v_service.duration_minutes, p_reserved_for;
end;
$$;
grant execute on function submit_public_reservation(text, text, text, bigint, timestamptz, bigint, numeric, numeric, text) to anon;


drop function if exists get_order_status(uuid);
create or replace function get_order_status(p_token uuid)
returns table(
  order_id bigint, channel text, status text, ready_at timestamptz, scheduled_for timestamptz,
  created_at timestamptz, total numeric, customer_name text,
  business_name text, business_logo_url text, theme_color text, contact_whatsapp text,
  rejection_reason text, online_customer_note text, items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not check_rate_limit('order_status_ip:' || client_ip(), 60, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;
  if not check_rate_limit('order_status_token:' || p_token, 30, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;

  return query
    select o.id, o.channel, o.status, o.ready_at, o.scheduled_for, o.created_at, o.total, o.customer_name,
           b.name, b.logo_url, b.online_theme_color, b.online_contact_whatsapp, o.rejection_reason,
           o.online_customer_note,
           (
             select coalesce(jsonb_agg(jsonb_build_object(
               'name', coalesce(oi.selected_modifiers->0->>'text', mi.name),
               'qty', oi.qty,
               'line_total', oi.line_total,
               'note', oi.note
             ) order by oi.id), '[]'::jsonb)
             from order_items oi
             join menu_items mi on mi.id = oi.menu_item_id
             where oi.order_id = o.id
           ) as items
    from orders o join businesses b on b.id = o.business_id
    where o.tracking_token = p_token;
end;
$$;
grant execute on function get_order_status(uuid) to anon;


drop function if exists update_order_note(uuid, text);
create or replace function update_order_note(p_token uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not check_rate_limit('order_note_token:' || p_token, 10, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;

  update orders
  set online_customer_note = nullif(trim(p_note), '')
  where tracking_token = p_token
    and status = 'pending'
  returning id into v_id;

  return v_id is not null;
end;
$$;
grant execute on function update_order_note(uuid, text) to anon;


drop function if exists get_loyalty_card(uuid);
create or replace function get_loyalty_card(p_token uuid)
returns table(
  customer_name text, loyalty_points numeric, business_name text, logo_url text, banner_url text,
  accent_color text, loyalty_system_type text, loyalty_visits int, loyalty_visits_threshold int,
  loyalty_reward_label text, loyalty_icon_style text, loyalty_free_rewards int, loyalty_pattern_style text,
  loyalty_tier text, loyalty_theme text, loyalty_custom_icon_url text, customer_since timestamptz, total_saved numeric
)
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_spend numeric;
  v_saved numeric;
begin
  if not check_rate_limit('loyalty_card_ip:' || client_ip(), 60, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;
  if not check_rate_limit('loyalty_card_token:' || p_token, 30, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;

  select coalesce(sum(o.total), 0) into v_spend
  from orders o join customers c on c.id = o.customer_id
  where c.public_token = p_token and o.status = 'completed';

  select coalesce(sum(mi.price * oi.qty), 0) into v_saved
  from order_items oi
  join orders o on o.id = oi.order_id
  join customers c on c.id = o.customer_id
  join menu_items mi on mi.id = oi.menu_item_id
  where c.public_token = p_token and oi.is_points_redemption = true;

  return query
  select c.name, c.loyalty_points, b.name, b.loyalty_logo_url, b.loyalty_banner_url, b.loyalty_accent_color,
    b.loyalty_system_type, c.loyalty_visits, b.loyalty_visits_threshold, b.loyalty_reward_label, b.loyalty_icon_style, c.loyalty_free_rewards,
    b.loyalty_pattern_style,
    case
      when v_spend >= 10000 then 'Platinum'
      when v_spend >= 5000 then 'Gold'
      when v_spend >= 1000 then 'Silver'
      else 'Bronze'
    end,
    b.loyalty_theme, b.loyalty_custom_icon_url, c.created_at, v_saved
  from customers c join businesses b on b.id = c.business_id
  where c.public_token = p_token;
end;
$$;
grant execute on function get_loyalty_card(uuid) to anon;


drop function if exists subscribe_loyalty_push(uuid, text, text, text);
create or replace function subscribe_loyalty_push(p_token uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
begin
  if not check_rate_limit('loyalty_push_sub_token:' || p_token, 10, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;

  select id into v_customer_id from customers where public_token = p_token;
  if v_customer_id is null then
    raise exception 'card not found';
  end if;
  insert into push_subscriptions (customer_id, endpoint, p256dh, auth)
  values (v_customer_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set customer_id = excluded.customer_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
grant execute on function subscribe_loyalty_push(uuid, text, text, text) to anon;


drop function if exists get_pending_loyalty_request(uuid);
create or replace function get_pending_loyalty_request(p_token uuid)
returns table(id bigint, business_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not check_rate_limit('loyalty_pending_token:' || p_token, 30, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;

  return query
    select r.id, b.name, r.expires_at
    from loyalty_redemption_requests r
    join customers c on c.id = r.customer_id
    join businesses b on b.id = r.business_id
    where c.public_token = p_token
      and r.status = 'pending'
      and r.expires_at > now()
    order by r.created_at desc
    limit 1;
end;
$$;
grant execute on function get_pending_loyalty_request(uuid) to anon;


drop function if exists respond_loyalty_redemption_request(uuid, bigint, boolean);
create or replace function respond_loyalty_redemption_request(p_token uuid, p_request_id bigint, p_approve boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated bigint;
begin
  if not check_rate_limit('loyalty_respond_token:' || p_token, 10, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;

  update loyalty_redemption_requests r
  set status = case when p_approve then 'confirmed' else 'declined' end,
      responded_at = now()
  from customers c
  where r.customer_id = c.id
    and c.public_token = p_token
    and r.id = p_request_id
    and r.status = 'pending'
    and r.expires_at > now()
  returning r.id into v_updated;

  return v_updated is not null;
end;
$$;
grant execute on function respond_loyalty_redemption_request(uuid, bigint, boolean) to anon;

-- Diagnostic-only helper (probed client_ip() visibility) — never granted to
-- anon/authenticated, but no reason to leave pg_get_functiondef access lying
-- around once its one-time job is done.
drop function if exists __dump_funcdef(text);
