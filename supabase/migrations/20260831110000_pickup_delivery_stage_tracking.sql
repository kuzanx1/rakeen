-- Closes a real gap reported live: an accepted online PICKUP order has no
-- "جارية" (running) tracking at all in the POS today — only delivery orders
-- get the ready→delivered two-step handoff via ACTIVE_DELIVERY_ORDERS
-- (public/pos/rakeen-pos.js). The instant a pickup order is accepted
-- (status: pending→completed), it drops straight into the flat "مكتملة"
-- list, indistinguishable from one that's actually been picked up. This
-- migration is purely additive — it does NOT touch what `status='completed'`
-- means (still "accepted, a real committed sale", read by ~14 other
-- migrations for revenue reporting) — fulfillment stage keeps living on its
-- own nullable timestamp columns, the same pattern ready_at/delivered_at
-- already established.

-- Delivery gets one more real stage: "خرج للتوصيل" (out for delivery),
-- between ready and delivered. Deliberately NOT wired as a hard gate on
-- mark_delivery_order_delivered below — a cashier who's always gone
-- ready→delivered directly must keep working exactly as before; this is an
-- optional extra checkpoint, not a new required step.
alter table orders add column out_for_delivery_at timestamptz;

-- Distinguishes "customer picked ASAP" from "customer picked a specific
-- later time" — today both just produce a scheduled_for timestamp with no
-- way to tell them apart server-side (confirmed: pickupTimeMode in
-- rakeen-order.js is purely client-side UI state, never transmitted).
-- Needed so the POS can reserve its attention-grabbing pickup-time alert
-- for the case that actually needs it (a real commitment to a later time)
-- instead of showing it for every single pickup order including ASAP ones.
alter table orders add column scheduled_by_customer boolean not null default false;

-- submit_online_order: identical to the current definition
-- (20260829210000_fix_submit_online_order_missing_is_active_check.sql) with
-- one additive, default-valued parameter appended at the end (safe for any
-- other caller — there are none besides the storefront, but appending
-- rather than inserting keeps positional-call compatibility anyway) and one
-- new line storing it.
create or replace function public.submit_online_order(p_business_slug text, p_customer_name text, p_customer_phone text, p_channel text, p_delivery_address text, p_note text, p_items jsonb, p_branch_id bigint DEFAULT NULL::bigint, p_customer_lat numeric DEFAULT NULL::numeric, p_customer_lng numeric DEFAULT NULL::numeric, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_client_order_uuid uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_scheduled_by_customer boolean DEFAULT false)
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
    customer_lat, customer_lng, scheduled_for, scheduled_by_customer,
    client_order_uuid
  ) values (
    v_business.id, v_branch.id, null, p_channel, 'online',
    case when p_payment_method = 'card' then 'awaiting_payment' else 'pending' end,
    p_payment_method,
    case when p_payment_method = 'card' then 'unpaid' else 'paid' end,
    0,
    0, 0, 0, 0, 0, 0,
    p_customer_name, p_customer_phone, v_customer_id, p_delivery_address, p_note,
    p_customer_lat, p_customer_lng, v_scheduled_for, coalesce(p_channel = 'pickup' and p_scheduled_by_customer, false),
    v_uuid
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price, business_id, cost_mode, total_pieces into v_menu_item from menu_items
      where id = (v_item->>'menu_item_id')::bigint and business_id = v_business.id and active = true;
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

-- Generic "mark delivered" for any channel that isn't already covered by a
-- channel-specific RPC — today that's just pickup (delivery keeps its own
-- mark_delivery_order_delivered, untouched, so nothing about the existing
-- live delivery flow changes). Same idempotency guard shape as every other
-- status-mutating RPC in this codebase.
create or replace function mark_order_delivered(p_order_id bigint)
returns table(delivered_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  return query
  update orders set
    delivered_at = now()
  where orders.id = p_order_id
    and orders.business_id = v_business_id
    and orders.ready_at is not null
    and orders.delivered_at is null
  returning orders.delivered_at;
end;
$$;

-- New, optional milestone for delivery — NOT required before
-- mark_delivery_order_delivered (that RPC's guard is untouched), purely an
-- extra checkpoint a cashier can use if they want to track "handed to the
-- rep" separately from "confirmed dropped off".
create or replace function mark_order_out_for_delivery(p_order_id bigint)
returns table(out_for_delivery_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  return query
  update orders set
    out_for_delivery_at = now()
  where orders.id = p_order_id
    and orders.business_id = v_business_id
    and orders.channel = 'delivery'
    and orders.ready_at is not null
    and orders.out_for_delivery_at is null
  returning orders.out_for_delivery_at;
end;
$$;

-- get_order_status: adds delivered_at/out_for_delivery_at/scheduled_by_customer
-- so the customer's own tracking page can show a real "تم التسليم" closing
-- stage and an "خرج للتوصيل" step for delivery, instead of capping at
-- "جاري توصيله" forever once ready.
drop function if exists get_order_status(uuid);
create or replace function get_order_status(p_token uuid)
returns table(
  order_id bigint, channel text, status text, ready_at timestamptz, scheduled_for timestamptz,
  created_at timestamptz, total numeric, customer_name text,
  business_name text, business_logo_url text, theme_color text, contact_whatsapp text,
  rejection_reason text, online_customer_note text, items jsonb,
  branch_name text, branch_address text, branch_lat numeric, branch_lng numeric,
  payment_method text, payment_status text,
  subtotal numeric, vat_amount numeric, business_vat_number text, vat_registered boolean,
  delivered_at timestamptz, out_for_delivery_at timestamptz, scheduled_by_customer boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
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
           ) as items,
           case when o.channel = 'pickup' then br.name else null end,
           case when o.channel = 'pickup' then br.address else null end,
           case when o.channel = 'pickup' then br.lat else null end,
           case when o.channel = 'pickup' then br.lng else null end,
           o.payment_method, o.payment_status,
           o.subtotal, o.vat_amount, b.vat_number, coalesce(b.vat_registered, true),
           o.delivered_at, o.out_for_delivery_at, o.scheduled_by_customer
    from orders o
    join businesses b on b.id = o.business_id
    left join branches br on br.id = o.branch_id
    where o.tracking_token = p_token;
end;
$$;
grant execute on function get_order_status(uuid) to anon;
