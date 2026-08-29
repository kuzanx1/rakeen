-- Saudi Ministry of Commerce requires displayed/shelf prices to be VAT-
-- inclusive and identical to the final charge. Every checkout path in this
-- codebase currently adds VAT on top of menu_items.price anyway, double-
-- taxing customers whose owner already prices the menu tax-inclusive (the
-- legally-required norm). Fixed via ONE business-wide toggle — not
-- per-product, since inclusive display is a legal requirement and mixed
-- pricing within one restaurant makes no sense. Default true: matches the
-- legal norm AND fixes the bug for every existing business with zero
-- migration-time action needed.
alter table businesses add column prices_include_vat boolean not null default true;

-- Input-VAT capture on purchase invoices (ingredient/stock purchases only —
-- general_expenses are deliberately excluded from VAT-return calculations,
-- since which of those are blocked from input-VAT recovery — e.g.
-- entertainment/staff-meal-type spend — isn't reliably ascertainable here).
-- purchase_invoices has no invoice-group table, just a shared
-- invoice_group_id tag across per-stock-item line rows; a real supplier
-- invoice states ONE VAT total for the whole invoice. This column holds
-- THIS LINE's proportional share of its invoice-group's total VAT
-- (line.total_cost / group total_cost, applied to the group VAT total),
-- not a whole-invoice figure. Nullable: existing rows and any future row
-- where the owner didn't enter a VAT figure have no data and must not be
-- silently counted as zero input VAT — the VAT-return report treats null
-- as "unknown, excluded", not "0".
alter table purchase_invoices add column vat_amount numeric;

-- ===== submit_online_order: branch VAT math on prices_include_vat =====
-- Body is otherwise byte-identical to the 20260810150000 version — only the
-- v_vat/v_total computation changes.
drop function if exists submit_online_order(text, text, text, text, text, text, jsonb, bigint, numeric, numeric, timestamptz);

create or replace function submit_online_order(
  p_business_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_channel text,
  p_delivery_address text,
  p_note text,
  p_items jsonb, -- [{menu_item_id, qty, selected_options?:[{group_id,option_id}], box_selections?:[{eligible_item_id,qty}]}]
  p_branch_id bigint default null,
  p_customer_lat numeric default null,
  p_customer_lng numeric default null,
  p_scheduled_for timestamptz default null
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
begin
  select * into v_business from businesses where online_menu_slug = p_business_slug and online_ordering_enabled = true;
  if not found then
    raise exception 'المطعم غير متاح للطلب الإلكتروني حاليًا';
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

  -- Delivery orders are never scheduled in this pass (only the prep/ready
  -- flow applies) — pickup is the only channel with a customer-chosen time.
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
    -- no hours configured for this branch: accept the client's chosen time
    -- as-is (informational only, not a hard bound) rather than fabricate a
    -- closing time that was never set by the owner.
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
    gen_random_uuid()
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

  -- Inclusive (default, legally required for KSA consumer-facing prices):
  -- (subtotal + delivery) IS the tax-inclusive amount actually charged —
  -- VAT is derived from within it, never added on top. Exclusive (opt-out,
  -- pre-existing behavior): VAT is added on top of the accumulated base.
  if coalesce(v_business.prices_include_vat, true) then
    v_vat := round((v_subtotal + v_delivery_fee) * coalesce(v_business.vat_rate, 0.15) / (1 + coalesce(v_business.vat_rate, 0.15)), 2);
    v_total := v_subtotal + v_delivery_fee;
  else
    v_vat := round((v_subtotal + v_delivery_fee) * coalesce(v_business.vat_rate, 0.15), 2);
    v_total := v_subtotal + v_delivery_fee + v_vat;
  end if;

  update orders set subtotal = v_subtotal, vat_amount = v_vat, total = v_total, cash_amount = v_total, delivery_fee = v_delivery_fee
    where id = v_order_id;

  return query select v_order_id, v_total, o.tracking_token, o.scheduled_for from orders o where o.id = v_order_id;
end;
$$;

grant execute on function submit_online_order(text, text, text, text, text, text, jsonb, bigint, numeric, numeric, timestamptz) to anon;
