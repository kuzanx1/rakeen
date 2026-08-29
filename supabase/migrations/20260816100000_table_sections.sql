-- Table sections (أقسام) — physical grouping of tables (عائلات/شباب/داخلي/
-- خارجي/VIP...), fully independent of restaurant_tables.status (which
-- tracks "what's true right now": available/occupied/reserved/cleaning). A
-- branch that never creates a section keeps the flat table grid exactly as
-- it works today — section_id is nullable and the POS falls back to an
-- ungrouped list when no sections exist.
create table table_sections (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  name text not null,
  sort_order int not null default 0,
  unique (branch_id, name)
);
create index table_sections_business_id_idx on table_sections(business_id);

alter table restaurant_tables add column section_id bigint references table_sections(id) on delete set null;

alter table table_sections enable row level security;
create policy table_sections_all on table_sections for all
  using (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:operations')))
  with check (business_id = current_business_id() and (has_permission('pos:register') or has_permission('screen:operations')));

-- ===== complete_pos_order: auto-transition a dine-in table to "needs
-- cleaning" the moment its bill is paid, instead of leaving status
-- untouched forever (today nothing writes it after checkout — a paid table
-- silently stays "occupied" until a cashier happens to cycle it manually).
-- Deliberately never jumps straight back to "available" — a human has to
-- confirm the table is actually cleared via the POS "تم التنظيف" action, or
-- a busy floor drifts out of sync with reality within the first hour.
-- Signature is unchanged from the previous version, so create or replace is
-- enough — no drop/recreate needed.
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

  select * into v_business from businesses where id = v_business_id;

  select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
    from compute_vat_split(
      p_subtotal - p_discount_amount,
      case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
      coalesce(v_business.prices_include_vat, true)
    ) cvs;

  insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone,
    subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid,
    channel, delivery_platform_id, table_id, staff_member_id, platform_invoice_last4)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone,
    p_subtotal, p_discount_pct, p_discount_amount, v_vat, v_total, p_payment_method, p_cash_amount, p_client_order_uuid,
    p_channel, p_delivery_platform_id, p_table_id, p_staff_member_id, p_platform_invoice_last4)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into order_items (order_id, menu_item_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers)
    values (
      v_order_id, (item->>'menu_item_id')::bigint, (item->>'qty')::numeric, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers'
    );

    for dec in select * from jsonb_array_elements(coalesce(item->'stock_decrements', '[]'::jsonb)) loop
      update stock_items set qty_on_hand = qty_on_hand - (dec->>'qty')::numeric, updated_at = now()
      where id = (dec->>'stock_item_id')::bigint;
    end loop;
  end loop;

  if p_table_id is not null then
    update restaurant_tables set status = 'cleaning'
    where id = p_table_id and business_id = v_business_id and status <> 'cleaning';
  end if;

  return v_order_id;
end;
$$;

-- ===== seat_table_reservation: guest physically arrived at a reserved
-- table. Flips the reservation to 'seated' and the table to 'occupied' in
-- one atomic call, so the POS can never end up with only one of the two
-- having happened (e.g. a network blip between two separate client updates
-- leaving the table stuck "reserved" while the reservation already reads
-- "seated"). Returns the table_id so the caller can route straight into
-- order-building for it.
create or replace function seat_table_reservation(p_reservation_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_table_id bigint;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select table_id into v_table_id from table_reservations
    where id = p_reservation_id and business_id = v_business_id and status = 'upcoming';

  if v_table_id is null then
    raise exception 'reservation not found or already resolved';
  end if;

  update table_reservations set status = 'seated' where id = p_reservation_id;
  update restaurant_tables set status = 'occupied' where id = v_table_id and business_id = v_business_id;

  return v_table_id;
end;
$$;
