-- Geidea card payment for the online storefront, bring-your-own-merchant:
-- each restaurant opens its own Geidea account and hands Rakeen two
-- credentials to connect. See the plan this was built from for the full
-- design rationale (order-creation timing, encryption-at-rest, anti-
-- spoofing webhook lookup).

-- ===== orders: new 'awaiting_payment' status + gateway correlation =====
-- 'awaiting_payment' is a card order that's been created but not yet paid —
-- deliberately distinct from 'pending' (which means "cashier must
-- accept/reject"), so an unpaid order never reaches the POS's incoming-
-- order queue or the dashboard's revenue totals (both already gate on
-- 'pending'/'paid' respectively) until the webhook confirms payment and
-- flips it to 'pending' exactly like a cash online order.
alter table orders drop constraint orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pending', 'completed', 'cancelled', 'refunded', 'rejected', 'awaiting_payment'));

-- Geidea's own orderId GUID from the callback, for support/reconciliation.
-- Nullable — cash orders never set it.
alter table orders add column gateway_reference text;

-- ===== businesses: public, non-secret "is Geidea connected" flag =====
-- Plain columns, not secrets — the storefront needs geidea_connected to
-- decide whether to even show the card payment option; geidea_public_key_last4
-- is dashboard-only display, no reason for anon to see it.
alter table businesses add column geidea_connected boolean not null default false;
alter table businesses add column geidea_public_key_last4 text;
grant select (geidea_connected) on businesses to anon;

-- ===== business_payment_gateways: the only place the real secret lives =====
-- The first long-lived, recoverable, per-business third-party secret this
-- codebase stores. RLS-enabled with ZERO policies denies every row to every
-- role except the table owner / service-role key — deliberately stronger
-- than businesses' row-level-only RLS (any signed-in staff member can
-- select * their own business row today; a Geidea apiPassword must never be
-- readable that way). The explicit revoke below is belt-and-suspenders on
-- top of RLS for any future grant-auditor reading this table directly. Only
-- the three new service-role-backed API routes ever touch this table —
-- never a Postgres RPC callable by authenticated, never PostgREST from the
-- dashboard directly.
create table business_payment_gateways (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  provider text not null default 'geidea' check (provider = 'geidea'),
  merchant_public_key text not null,
  api_password_ciphertext text not null,
  api_password_iv text not null,
  connected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider)
);
alter table business_payment_gateways enable row level security;
revoke all on business_payment_gateways from authenticated, anon;

-- ===== submit_online_order: card orders land as 'awaiting_payment' =====
-- Body is otherwise byte-identical to the 20260819081000 version — same
-- validation, same rate limiting, same server-computed pricing. Only the
-- new p_payment_method branch and the final insert/update differ.
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
  p_client_order_uuid uuid default null,
  p_payment_method text default 'cash'
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

  -- Never trust the client's claimed payment method at face value — a
  -- business must have an actually-connected Geidea credential before any
  -- 'card' order can be created for it, independent of anything the
  -- storefront's own UI gating already does.
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

  -- cash_amount stays 0 for a card order until the webhook confirms real
  -- payment and fills it in — never claim money was collected before it
  -- actually was.
  update orders set
    subtotal = v_subtotal, vat_amount = v_vat, total = v_total, delivery_fee = v_delivery_fee,
    cash_amount = case when p_payment_method = 'card' then 0 else v_total end
    where id = v_order_id;

  -- The 350-free-trial-order counter only increments here for cash orders.
  -- A card order that's abandoned or declined must not burn a free order —
  -- that increment happens in the Geidea webhook instead, gated on the same
  -- payment_status='unpaid'->'paid' transition.
  if p_payment_method <> 'card' then
    update businesses set online_order_free_count = online_order_free_count + 1 where id = v_business.id;
  end if;

  return query select v_order_id, v_total, o.tracking_token, o.scheduled_for from orders o where o.id = v_order_id;
end;
$$;
grant execute on function submit_online_order(text, text, text, text, text, text, jsonb, bigint, numeric, numeric, timestamptz, uuid, text) to anon;

-- ===== increment_online_order_free_count: atomic trial-counter bump =====
-- Used only by the Geidea webhook (service-role client), at the moment a
-- card order is confirmed paid — see the deferred-increment note in
-- submit_online_order above. Not granted to anon/authenticated; the
-- service-role key already bypasses RLS and has default EXECUTE on public
-- functions, so no explicit grant is needed for its one caller.
create or replace function increment_online_order_free_count(p_business_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update businesses set online_order_free_count = online_order_free_count + 1 where id = p_business_id;
$$;
