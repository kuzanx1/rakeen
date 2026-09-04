-- POS shift-close controls.
--
-- pos_require_manager_pin_for_close
--   Closing a shift is manager-approved by default, and that default is
--   deliberate: the closing count is the one number nobody else checks, so
--   a second person signing it off is the control that makes it worth
--   anything. A single-operator business (one owner who is also the
--   cashier) has nobody to approve it and only ends up typing their own
--   PIN at themselves, so they can switch it off.
--
--   DEFAULT true, and the app treats an unreadable answer as true as well:
--   a failed settings read must never be the thing that removes a control
--   on the cash drawer.
alter table businesses
  add column if not exists pos_require_manager_pin_for_close boolean not null default true;

comment on column businesses.pos_require_manager_pin_for_close is
  'POS: require the manager PIN to close a shift. On by default; off suits a single-operator business.';
-- At most one open shift per branch.
--
-- Nothing enforced this. findOpenShift() looks for an open row and opens a
-- new one when it finds none, so two devices checking at the same moment
-- both find none and both insert. The branch then has two open shifts, the
-- day's sales split between them by accident of which till rang them up,
-- and each closing count is measured against a float that only covers part
-- of the drawer -- while the drawer itself is one physical box.
--
-- A partial unique index is the right shape here: it constrains only rows
-- where closed_at is null, so a branch accumulates as many CLOSED shifts as
-- it likes while never having two open at once. Postgres enforces it at
-- the point of insert, which is the only place a race like this can be
-- settled correctly.
--
-- Scoped to branch_id, not cashier_id, because that matches what a shift
-- actually is here: the branch PIN is a shared account and the drawer
-- belongs to the till, not to a person. Which human is on it is recorded
-- separately in shifts.staff_member_id.
--
-- NOTE: if a branch already has more than one open shift when this runs,
-- the index creation FAILS. That is deliberate -- silently closing one
-- would discard a real, uncounted drawer. Close them from the app first,
-- or inspect them with:
--   select branch_id, count(*) from shifts where closed_at is null
--     group by branch_id having count(*) > 1;
create unique index if not exists shifts_one_open_per_branch
  on shifts (branch_id)
  where closed_at is null;
-- Cash that enters or leaves the drawer without being a sale.
--
-- Paying a supplier out of the till, taking float from the safe, dropping
-- excess cash to the office. These happen in every real shop, and until now
-- they had nowhere to go: the expected figure only ever counted the opening
-- float plus cash sales, so every legitimate movement surfaced at closing
-- as an unexplained variance. That is the single most common reason a
-- drawer "doesn't balance" once the arithmetic itself is correct -- and it
-- trains everyone to shrug at variances, which defeats the whole count.
--
-- Recorded as a movement, the money is accounted for and the variance goes
-- back to meaning what it should: cash that is genuinely unaccounted for.
create table if not exists shift_cash_movements (
  id bigint generated always as identity primary key,
  shift_id bigint not null references shifts(id),
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id),
  -- 'in'  = money added to the drawer (float from the safe, a correction)
  -- 'out' = money removed (supplier paid from the till, a cash drop)
  direction text not null check (direction in ('in', 'out')),
  -- Always POSITIVE. The direction column carries the sign, so a stray
  -- negative cannot silently flip a payout into a top-up.
  amount numeric not null check (amount > 0),
  -- Required, and deliberately so: an unexplained movement is just a
  -- variance that has been given a hiding place.
  reason text not null check (length(btrim(reason)) > 0),
  staff_member_id bigint references staff_members(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists shift_cash_movements_shift_id_idx
  on shift_cash_movements (shift_id);

alter table shift_cash_movements enable row level security;

-- Read: anyone who can work the till or see the staff screen, same as
-- shifts_select, since this is part of the same reconciliation picture.
drop policy if exists shift_cash_movements_select on shift_cash_movements;
create policy shift_cash_movements_select on shift_cash_movements for select
  using (
    business_id = current_business_id()
    and (has_permission('pos:register') or has_permission('screen:staff'))
  );

-- Write: the cashier on the till. INSERT only -- no update, no delete.
-- A recorded movement is part of the audit trail behind a signed-off
-- closing balance; correcting one means recording the opposite movement,
-- exactly as a ledger works, not editing history.
drop policy if exists shift_cash_movements_insert on shift_cash_movements;
create policy shift_cash_movements_insert on shift_cash_movements for insert
  with check (
    business_id = current_business_id()
    and has_permission('pos:register')
    and created_by = auth.uid()
  );

comment on table shift_cash_movements is
  'Cash into/out of the drawer that is not a sale (supplier paid from the till, float from the safe, cash drop). Insert-only; correct by recording the opposite movement.';
-- Receipt theme.
--
-- A thermal printer gives one ink colour, one paper width, and a roll that
-- costs money — so a receipt "theme" here is a set of decisions about
-- density and hierarchy, not a palette:
--
--   classic  balanced, with logo and section rules. The default.
--   compact  paper-saving: no logo, tighter leading, smaller type and a
--            smaller (still scannable) QR. Around a third shorter, which
--            is real money at a few hundred receipts a day.
--   elegant  presentation: the business name letter-spaced between two
--            rules, a hairline under every item so the list reads as a
--            table, and the total in its own box.
--
-- Every theme prints the full ZATCA Phase 1 simplified tax invoice: the
-- heading, the seller's VAT number, the timestamp, the total including
-- VAT, the VAT amount, and the TLV QR. The check constraint keeps an
-- unknown value out; the app also falls back to 'classic' on anything it
-- does not recognise, so neither layer can produce an unprintable receipt.
alter table businesses
  add column if not exists receipt_theme text not null default 'classic';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'businesses_receipt_theme_check'
  ) then
    alter table businesses
      add constraint businesses_receipt_theme_check
      check (receipt_theme in ('classic', 'compact', 'elegant'));
  end if;
end $$;

comment on column businesses.receipt_theme is
  'POS receipt layout: classic | compact (paper-saving) | elegant. All three print the full ZATCA Phase 1 simplified tax invoice.';
-- Different opening hours per weekday.
--
-- branches.opening_time / closing_time are a single pair for the whole
-- week, which does not fit a real place: a restaurant that opens later on
-- Friday, or closes earlier on Thursday, has no way to say so.
--
-- Deliberately an ADDITIVE table rather than fourteen more columns on
-- branches:
--
--   * Most branches keep one set of hours. They add no rows and nothing
--     about their setup changes — which is the point of keeping this out
--     of the branches row and out of the default dashboard view.
--   * A branch that needs it adds only the days that DIFFER. Any weekday
--     with no row falls back to branches.opening_time/closing_time, so the
--     override list stays short and readable instead of restating the
--     same hours seven times.
--   * A closed day is a row with is_closed = true, which is a different
--     statement from "no row" (= use the default). Without that
--     distinction there is no way to say "shut on Friday".
--
-- weekday follows Postgres extract(dow): 0 = Sunday .. 6 = Saturday.
create table if not exists branch_weekly_hours (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  branch_id bigint not null references branches(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opening_time time,
  closing_time time,
  is_closed boolean not null default false,
  -- One row per weekday per branch: two rows for the same day would make
  -- "which hours apply?" unanswerable.
  unique (branch_id, weekday),
  -- An open day needs both ends. A closed one needs neither, and storing
  -- times against it would be a contradiction waiting to be read wrong.
  check (
    (is_closed and opening_time is null and closing_time is null)
    or (not is_closed and opening_time is not null and closing_time is not null)
  )
);

create index if not exists branch_weekly_hours_branch_idx
  on branch_weekly_hours (branch_id);

alter table branch_weekly_hours enable row level security;

-- Read: the same audience as the branch itself, since the POS needs it to
-- work out whether a shift has outlived its trading day.
drop policy if exists branch_weekly_hours_select on branch_weekly_hours;
create policy branch_weekly_hours_select on branch_weekly_hours for select
  using (business_id = current_business_id());

-- Write: whoever administers branches from the dashboard.
drop policy if exists branch_weekly_hours_write on branch_weekly_hours;
create policy branch_weekly_hours_write on branch_weekly_hours for all
  using (business_id = current_business_id() and has_permission('screen:settings'))
  with check (business_id = current_business_id() and has_permission('screen:settings'));

comment on table branch_weekly_hours is
  'Per-weekday opening hours overrides. A weekday with no row uses branches.opening_time/closing_time; is_closed=true means shut that day. Optional — most branches need none.';
-- Cash on delivery: the money is recorded when it is actually collected.
--
-- Before this, submit_online_order wrote payment_status = 'paid' the moment
-- the customer tapped send on a cash order -- before a single riyal existed.
-- Two things went wrong from that one line:
--
--   1. An order the customer never paid for (no answer at the door, refused
--      at the counter) stayed "paid" forever, inflating revenue.
--   2. shift_id was never set on an online order -- the only function that
--      has ever written it is complete_pos_order -- and shift totals filter
--      on shift_id. So when the driver DID come back with the cash, it
--      entered no shift at all: the drawer held money the closing report
--      did not expect, and every count came out over by that amount.
--
-- The fix is to move "paid" to the moment someone actually receives the
-- money, which is also the moment it belongs to a specific open shift.
-- Card is untouched: it was already 'unpaid' until the gateway confirms.
--
-- It also adds the switch that was missing: cash was hardcoded on for every
-- storefront, so a store that wants prepaid-only orders had no way to say
-- so. Defaults to true, which is exactly today's behaviour.

-- anon needs to read it: the storefront decides whether to offer the cash
-- option before anyone signs in, and these columns are granted one by one.
alter table businesses
  add column if not exists online_cod_enabled boolean not null default true;
grant select (online_cod_enabled) on businesses to anon;

comment on column businesses.online_cod_enabled is
  'Storefront: offer cash on collection/delivery. Enforced in submit_online_order too -- the storefront is public, so hiding the button is not enforcement.';

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

-- The single step a cashier takes at handover for a cash order.
--
-- Deliberately ONE function doing all three writes together: marking it
-- paid, attaching it to the open shift, and recording the handover. Split
-- across separate calls, a failure between them would leave money that is
-- "paid" but belongs to no shift -- which is the exact bug this migration
-- exists to remove.
create or replace function confirm_cod_collected(p_order_id bigint, p_shift_id bigint)
returns table(order_id bigint, collected_total numeric)
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

  -- The shift must belong to this business and still be open. Attaching
  -- money to a closed shift would move a total a manager already counted
  -- and signed off, which is worse than refusing the write.
  if not exists (
    select 1 from shifts s
    where s.id = p_shift_id
      and s.business_id = v_business_id
      and s.closed_at is null
  ) then
    raise exception 'ما فيه وردية مفتوحة لتسجيل المبلغ فيها';
  end if;

  return query
  update orders o set
    payment_status = 'paid',
    shift_id = p_shift_id,
    cash_amount = o.total,
    delivered_at = coalesce(o.delivered_at, now())
  where o.id = p_order_id
    and o.business_id = v_business_id
    and o.payment_method = 'cash'
    and o.payment_status = 'unpaid'
    and o.status not in ('cancelled', 'refunded', 'rejected')
  returning o.id, o.total;

  -- Also the double-tap guard: the second call finds payment_status
  -- already 'paid' and refuses, so one order can never be banked twice.
  if not found then
    raise exception 'الطلب غير متاح للتحصيل — يمكن تم تحصيله من جهاز ثاني';
  end if;
end;
$$;

comment on function confirm_cod_collected(bigint, bigint) is
  'Cash-on-delivery collection: marks the order paid, attaches it to the open shift, and records handover -- in one statement. The only path by which an online cash order enters a drawer total.';
-- The storefront's second payment switch: online card payment.
--
-- Cash got its switch in the previous migration. Card had only an implicit
-- one -- whether a Geidea gateway happened to be connected -- so a store
-- that connected a gateway could never stop offering card without
-- disconnecting it entirely, and had no way to prepare a gateway before
-- going live with it.
--
-- Defaults to true, so a store with a connected gateway keeps behaving
-- exactly as it does today.
--
-- NOTE: this switch cannot make card payment work on its own. The gateway
-- must also be connected, and today no business has one -- so turning this
-- on where no gateway exists correctly changes nothing.
alter table businesses
  add column if not exists online_card_enabled boolean not null default true;
grant select (online_card_enabled) on businesses to anon;

comment on column businesses.online_card_enabled is
  'Storefront: offer online card payment. ANDed with a connected Geidea gateway -- this switch alone cannot enable card payment. Enforced in submit_online_order as well as hidden in the UI.';

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
-- Let the storefront see a branch's per-weekday hours.
--
-- branch_weekly_hours shipped with a single SELECT policy scoped to
-- current_business_id(), which is null for an anonymous visitor. So the
-- overrides were readable by staff and invisible to the one audience that
-- most needs them: a customer deciding whether the branch is open right
-- now. A branch marked closed on Friday still took Friday orders.
--
-- Mirrors "public branches read for online ordering" exactly — same
-- condition, on the business that owns the row — so a branch's hours are
-- exactly as public as the branch itself, and no more. The table holds
-- opening times and a closed flag; there is nothing here that is not
-- already implied by the storefront showing the branch at all.
drop policy if exists "public branch weekly hours read" on branch_weekly_hours;
create policy "public branch weekly hours read" on branch_weekly_hours for select
  using (exists (
    select 1 from businesses b
    where b.id = branch_weekly_hours.business_id
      and b.online_ordering_enabled = true
  ));

-- Column-level grants: anon reads are granted per column on this project,
-- so the policy alone is not enough.
grant select (id, business_id, branch_id, weekday, opening_time, closing_time, is_closed)
  on branch_weekly_hours to anon;
