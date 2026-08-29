-- Real dine-in order lifecycle (register -> serving -> paid) + a proper
-- walk-in waitlist, replacing the old "reservation bound to a specific
-- table at creation" model and the old single vague "occupied" status.
--
-- Why a new payment_status column instead of reusing orders.status: status
-- already encodes a distinct lifecycle (online-order accept/reject,
-- refund/cancel) that several existing read paths depend on unchanged.
-- payment_status is a second, independent axis — "has money actually been
-- collected for this order yet" — orthogonal to whether the order itself is
-- a real, kitchen-facing order. Every existing order-creation path
-- (complete_pos_order, submit_online_order) already collects payment at
-- the same moment it creates the row, so they all default to 'paid' with
-- zero behavior change. Only the new register_dine_in_order path inserts
-- 'unpaid' initially.

alter table orders add column payment_status text not null default 'paid' check (payment_status in ('unpaid','paid'));
-- register_dine_in_order legitimately doesn't know the payment method yet —
-- that's the whole point of "pay after eating". Every other insert path
-- still always supplies a real value; this only relaxes what was an
-- artificial always-true constraint for the one path that needs it.
alter table orders alter column payment_method drop not null;

-- ===== restaurant_tables: a real, granular lifecycle =====
-- available        -> empty, clean, ready
-- awaiting_order    -> guest seated, cashier hasn't taken/registered the order yet
-- serving           -> order registered (kitchen has it), not yet paid
-- awaiting_payment  -> cashier is closing out the bill
-- cleaning          -> guest left, needs bussing before it can be available again
-- reserved          -> legacy value from before this migration (a table could
--                      only reach it via the old manual status-cycle button,
--                      which no longer exists) — kept in the constraint so no
--                      existing row becomes invalid; last round already built
--                      a start-session/release escape hatch for it.
-- The old vague "occupied" is retired — nothing today can tell whether an
-- occupied table has had its order taken or paid, so any row sitting there
-- is migrated to the safest, least-presumptuous successor: awaiting_order
-- (worst case, a cashier sees "needs order taken" for a table that's
-- actually mid-meal, and self-corrects the first time they check it — far
-- safer than falsely claiming "paid" or "just seated" for a table we have
-- no real signal about).
alter table restaurant_tables drop constraint if exists restaurant_tables_status_check;
alter table restaurant_tables add constraint restaurant_tables_status_check
  check (status in ('available','awaiting_order','serving','awaiting_payment','cleaning','reserved','occupied'));
update restaurant_tables set status = 'awaiting_order' where status = 'occupied';
alter table restaurant_tables drop constraint restaurant_tables_status_check;
alter table restaurant_tables add constraint restaurant_tables_status_check
  check (status in ('available','awaiting_order','serving','awaiting_payment','cleaning','reserved'));

-- One generic "since when has this table been in its current state" column,
-- kept correct via trigger rather than trusting every scattered .update()
-- call-site (POS and dashboard both write this table directly in many
-- places) to remember to set it by hand. Powers "since 12 د" badges on
-- awaiting_order/serving/awaiting_payment/cleaning cards without needing a
-- separate timestamp column per status.
alter table restaurant_tables add column status_changed_at timestamptz not null default now();

create or replace function set_table_status_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at = now();
  end if;
  return new;
end;
$$;

create trigger restaurant_tables_status_changed_at
  before update on restaurant_tables
  for each row execute function set_table_status_changed_at();

-- ===== businesses: pay-before-eating vs pay-after-eating =====
alter table businesses add column dine_in_pay_timing text not null default 'before' check (dine_in_pay_timing in ('before','after'));

-- ===== table_reservations -> walk-in waitlist =====
-- A waitlist entry is no longer bound to a specific table at creation —
-- the whole point is a first-come, first-served queue for whichever table
-- frees up next, not a claim on one particular table. table_id now only
-- gets filled in at the moment they're actually seated (seat_waitlist_entry
-- below). preferred_section_id reuses last round's table_sections instead
-- of inventing a separate free-text "seating preference" field — one list,
-- defined once by the owner, drives both the floor layout and this.
alter table table_reservations alter column table_id drop not null;
alter table table_reservations add column preferred_section_id bigint references table_sections(id) on delete set null;

-- ===== register_dine_in_order: create OR append to an open dine-in tab =====
-- Splits what complete_pos_order used to do in one shot into two moments,
-- because a pay-after table can sit "ordered but unpaid" for the length of
-- an entire meal — that gap needs a real, persisted order row (so the
-- kitchen sees it immediately and stock decrements immediately), not
-- something held only in the cashier's browser tab until final payment.
-- p_existing_order_id present -> append more items to that same still-open
-- order (e.g. a table orders dessert after mains) instead of creating a
-- second one; discount_pct is deliberately NOT re-accepted on append — it's
-- re-read from the existing order so a cashier who doesn't touch the
-- discount UI on a later round can never accidentally erase an earlier
-- discount.
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
  item jsonb;
  dec jsonb;
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
      channel, table_id, staff_member_id, payment_status)
    values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone,
      p_subtotal, v_discount_pct, v_discount_amount, v_vat, v_total, null, null, p_client_order_uuid,
      'dine_in', p_table_id, p_staff_member_id, 'unpaid')
    returning id into v_order_id;

    update restaurant_tables set status = 'serving', active_order_id = v_order_id
      where id = p_table_id and business_id = v_business_id;
  end if;

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

  return v_order_id;
end;
$$;

-- ===== pay_dine_in_order: close out an already-registered order =====
-- The counterpart to register_dine_in_order — this is the only place a
-- pay-after dine-in order's payment_method/cash_amount ever gets filled in.
-- Flips the table straight to 'cleaning' (never 'available' directly),
-- matching complete_pos_order's existing rule: a human confirms the table
-- is actually cleared before it's bookable again.
create or replace function pay_dine_in_order(
  p_order_id bigint,
  p_payment_method text,
  p_cash_amount numeric,
  p_customer_name text default null,
  p_customer_phone text default null
) returns bigint
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

  update orders set
    payment_status = 'paid',
    payment_method = p_payment_method,
    cash_amount = p_cash_amount,
    customer_name = coalesce(p_customer_name, customer_name),
    customer_phone = coalesce(p_customer_phone, customer_phone)
  where id = p_order_id and business_id = v_business_id and payment_status = 'unpaid'
  returning table_id into v_table_id;

  if v_table_id is null then
    raise exception 'order not found or already paid';
  end if;

  update restaurant_tables set status = 'cleaning', active_order_id = null
    where id = v_table_id and business_id = v_business_id;

  return v_table_id;
end;
$$;

-- ===== seat_waitlist_entry: replaces seat_table_reservation =====
-- The old version just flipped a reservation's already-known table_id to
-- occupied. Now the cashier picks WHICH now-available table to seat them
-- at (waitlist entries aren't bound to one at creation), so the table id
-- is a real argument, not read off the reservation row. Guards against two
-- cashiers racing to seat two different waitlist entries at the same table
-- at once — the update only succeeds if the table is still 'available'.
drop function if exists seat_table_reservation(bigint);

create or replace function seat_waitlist_entry(p_reservation_id bigint, p_table_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_resv_exists boolean;
  v_rows_updated int;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select exists(select 1 from table_reservations where id = p_reservation_id and business_id = v_business_id and status = 'upcoming')
    into v_resv_exists;
  if not v_resv_exists then
    raise exception 'waitlist entry not found or already resolved';
  end if;

  update restaurant_tables set status = 'awaiting_order'
    where id = p_table_id and business_id = v_business_id and status = 'available';
  get diagnostics v_rows_updated = row_count;
  if v_rows_updated = 0 then
    raise exception 'table is not available';
  end if;

  update table_reservations set table_id = p_table_id, status = 'seated' where id = p_reservation_id;

  return p_table_id;
end;
$$;
