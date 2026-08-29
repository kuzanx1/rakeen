-- Public online-ordering menu — a per-business storefront, gated by a
-- Rakeen-managed feature flag (not owner-toggleable) so it can be rolled
-- out selectively. Orders placed here land in the exact same orders/
-- order_items tables the POS and dashboard already read, tagged with
-- source='online' so they're visually distinguishable without needing a
-- second orders pipeline anywhere downstream.
alter table businesses add column online_ordering_enabled boolean not null default false;
alter table businesses add column online_menu_slug text unique;
alter table businesses add column online_theme_color text not null default '#C7FF4D';
alter table businesses add column online_offers_delivery boolean not null default true;
alter table businesses add column online_offers_pickup boolean not null default true;

alter table orders add column source text not null default 'pos' check (source in ('pos', 'online'));
alter table orders add column online_customer_note text;
alter table orders add column delivery_address text;
-- online orders have no signed-in cashier at all — cashier_id was never
-- read anywhere outside the POS auth/shift plumbing (staff_member_id is
-- the column actually used for "who rang this up" display), so relaxing
-- it here is safe.
alter table orders alter column cashier_id drop not null;

-- Public (anonymous) menu browsing — read-only, and only for businesses
-- that actually opted into (were opted into) online ordering. Mirrors the
-- shape of the POS/dashboard menu reads but has no auth.uid() at all.
create policy "public menu read for online ordering" on menu_items for select
  using (
    active = true
    and exists (select 1 from businesses b where b.id = menu_items.business_id and b.online_ordering_enabled = true)
  );
create policy "public categories read for online ordering" on menu_categories for select
  using (exists (select 1 from businesses b where b.id = menu_categories.business_id and b.online_ordering_enabled = true));
create policy "public modifier groups read for online ordering" on modifier_groups for select
  using (exists (select 1 from businesses b where b.id = modifier_groups.business_id and b.online_ordering_enabled = true));
create policy "public modifier options read for online ordering" on modifier_options for select
  using (exists (
    select 1 from modifier_groups g join businesses b on b.id = g.business_id
    where g.id = modifier_options.group_id and b.online_ordering_enabled = true
  ));
create policy "public box eligible items read for online ordering" on menu_item_box_eligible_items for select
  using (exists (
    select 1 from menu_items m join businesses b on b.id = m.business_id
    where m.id = menu_item_box_eligible_items.menu_item_id and b.online_ordering_enabled = true
  ));
create policy "public business branding read for online ordering" on businesses for select
  using (online_ordering_enabled = true);

-- Places a real order from the public menu. Runs with no signed-in user at
-- all (anon key only) — every price is recomputed server-side from the
-- real menu_items/modifier_options rows, never trusted from the client, so
-- a tampered request can't under-price an order. Payment is cash-on-
-- delivery/pickup only for v1 — no card handling here, nothing to secure
-- beyond the order data itself.
create or replace function submit_online_order(
  p_business_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_channel text,
  p_delivery_address text,
  p_note text,
  p_items jsonb -- [{menu_item_id, qty, selected_options:[{group_id,option_id}], note}]
)
returns table(order_id bigint, order_total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business record;
  v_branch_id bigint;
  v_customer_id bigint;
  v_subtotal numeric := 0;
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

  select id into v_branch_id from branches where business_id = v_business.id order by id limit 1;
  if v_branch_id is null then
    raise exception 'المطعم بدون فرع مسجّل';
  end if;

  select id into v_customer_id from customers
    where business_id = v_business.id and phone = p_customer_phone;
  if v_customer_id is null then
    insert into customers (business_id, name, phone) values (v_business.id, p_customer_name, p_customer_phone)
      returning id into v_customer_id;
  end if;

  insert into orders (
    business_id, branch_id, cashier_id, channel, source, status, payment_method, cash_amount,
    subtotal, discount_pct, discount_amount, vat_amount, total,
    customer_name, customer_phone, customer_id, delivery_address, online_customer_note,
    client_order_uuid
  ) values (
    v_business.id, v_branch_id, null, p_channel, 'online', 'completed', 'cash', 0,
    0, 0, 0, 0, 0,
    p_customer_name, p_customer_phone, v_customer_id, p_delivery_address, p_note,
    gen_random_uuid()
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price, business_id into v_menu_item from menu_items
      where id = (v_item->>'menu_item_id')::bigint and business_id = v_business.id and active = true;
    if not found then
      raise exception 'صنف غير متاح: %', (v_item->>'menu_item_id');
    end if;

    v_line_price := v_menu_item.price;
    v_line_mods := 0;
    v_line_label := v_menu_item.name;

    if v_item ? 'selected_options' then
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

  v_vat := round(v_subtotal * coalesce(v_business.vat_rate, 0.15), 2);
  v_total := v_subtotal + v_vat;

  update orders set subtotal = v_subtotal, vat_amount = v_vat, total = v_total, cash_amount = v_total
    where id = v_order_id;

  return query select v_order_id, v_total;
end;
$$;

grant execute on function submit_online_order(text, text, text, text, text, text, jsonb) to anon;
