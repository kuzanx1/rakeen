-- سجلّ حركة المخزون — وإصلاح الاسترجاع الناقص من جذره.
--
-- ▓ العطل المُثبت بالأرقام (هبية، بن كولمبي):
--   4447 → بيع خصم 108 → 4339 → استرجاع الطلب كاملاً → 4387، لا 4447.
--   رجع 48 وضاع 60.
--
--   لأن البيع يخصم من أربعة مصادر:
--     ١) أسطر الوصفة                  ← الاسترجاع يُعيدها
--     ٢) الصنف الجاهز                 ← الاسترجاع يُعيده
--     ٣) اختيارات البوكس              ← لا يُعيدها
--     ٤) خيارات مرتبطة بالمخزون       ← لا يُعيدها  ← الستّون غرامًا
--        (خيار «كولمبي» = ٢٠غ للكوب، ثلاثة أكواب = ٦٠غ)
--
--   والاسترجاع لا يقدر أن يُعيد الثالث والرابع أصلاً: خصمهما يصل في
--   حمولة النداء ويُطبَّق ثم يُنسى -- لا عمود في order_items يحفظه. فكان
--   الاسترجاع يُعيد الحساب من الوصفة، والوصفة لا تعرف ما اختاره الزبون.
--
-- ▓ العلاج: لا يُعاد الحساب، بل يُعكس ما وقع.
--   كل تغيّر في المخزون يُكتب سطرًا في stock_movements: كم كان، وكم صار،
--   ولماذا، ومن أي طلب وأي سطر. فالاسترجاع يقرأ ما خُصم لذلك السطر
--   ويعكسه -- أيًّا كان مصدره. ومصدرٌ جديد يُضاف غدًا يُعكس تلقائيًا،
--   فلا يتكرر هذا العطل بصيغةٍ أخرى.
--
--   وهو نفسه السجلّ الذي يظهر لصاحب المطعم داخل كل مادة:
--   «كان 5500، طلب #398 خصم 20، صار 5480».
--
-- ▓ ملاحظة على الترتيب: هذا الملف يُعيد تعريف complete_pos_order
--   و register_dine_in_order متضمّنًا discount_reason (ترحيل
--   20260916000000)، فلا يضرّ تشغيل ذاك قبله أو بعده.

-- ── ١) الجدول ────────────────────────────────────────────────
create table if not exists stock_movements (
  id            bigint generated always as identity primary key,
  business_id   bigint not null references businesses(id)  on delete cascade,
  stock_item_id bigint not null references stock_items(id) on delete cascade,
  -- سالب خصم، موجب إرجاع. والكمية قبل وبعد محفوظتان حتى يُقرأ السطر
  -- وحده بلا حساب: «كان كذا، صار كذا».
  delta      numeric not null,
  qty_before numeric not null,
  qty_after  numeric not null,
  reason  text not null,   -- sale | refund | indirect | purchase | manual
  source  text,            -- recipe | modifier | box | finished_good | indirect | reversal
  order_id      bigint references orders(id)      on delete set null,
  order_item_id bigint references order_items(id) on delete set null,
  note       text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_item_idx  on stock_movements(stock_item_id, created_at desc);
create index if not exists stock_movements_oi_idx    on stock_movements(order_item_id);
create index if not exists stock_movements_biz_idx   on stock_movements(business_id, created_at desc);

alter table stock_movements enable row level security;
drop policy if exists stock_movements_select on stock_movements;
create policy stock_movements_select on stock_movements for select
  using (business_id = current_business_id() and has_permission('screen:inventory'));
-- لا سياسة كتابة: يُكتب حصرًا عبر الدوال أدناه (security definer).

-- ── ٢) الحركة الواحدة: تُحدِّث المخزون وتكتب سطرها ───────────
create or replace function rk_stock_move(
  p_business_id   bigint,
  p_stock_item_id bigint,
  p_delta         numeric,
  p_reason        text,
  p_source        text    default null,
  p_order_id      bigint  default null,
  p_order_item_id bigint  default null,
  p_note          text    default null
) returns void
language plpgsql
security definer
set search_path = public
as $move$
declare
  v_after numeric;
begin
  if p_delta is null or p_delta = 0 or p_stock_item_id is null then
    return;
  end if;

  update stock_items
     set qty_on_hand = qty_on_hand + p_delta, updated_at = now()
   where id = p_stock_item_id and business_id = p_business_id
  returning qty_on_hand into v_after;

  -- مادة من منشأةٍ أخرى (أو محذوفة): لا تُمَسّ ولا يُكتب لها سطر.
  if v_after is null then
    return;
  end if;

  insert into stock_movements (business_id, stock_item_id, delta, qty_before, qty_after,
                               reason, source, order_id, order_item_id, note, created_by)
  values (p_business_id, p_stock_item_id, p_delta, v_after - p_delta, v_after,
          p_reason, p_source, p_order_id, p_order_item_id, p_note, auth.uid());
end;
$move$;
revoke all on function rk_stock_move(bigint, bigint, numeric, text, text, bigint, bigint, text) from public, anon;

-- ── ٣) الاستهلاك التلقائي: يخصم ويكتب سطره ──────────────────
create or replace function apply_indirect_consumption()
returns trigger
language plpgsql
security definer
set search_path = public
as $ind$
declare
  v_business_id bigint;
  v_category_id bigint;
  r             record;
begin
  if new.menu_item_id is null then
    return new;
  end if;

  select o.business_id, mi.category_id
    into v_business_id, v_category_id
  from orders o
  join menu_items mi on mi.id = new.menu_item_id
  where o.id = new.order_id;

  if v_business_id is null then
    return new;
  end if;

  for r in
    select icr.stock_item_id,
           (icr.deduct_qty / icr.per_qty::numeric) * new.qty as dec_qty
    from indirect_consumption_rules icr
    where icr.business_id = v_business_id
      and exists (
        select 1 from indirect_consumption_rule_targets t
        where t.rule_id = icr.id
          and ( t.menu_item_id = new.menu_item_id
             or (v_category_id is not null and t.menu_category_id = v_category_id) )
      )
  loop
    perform rk_stock_move(v_business_id, r.stock_item_id, -r.dec_qty,
                          'indirect', 'indirect', new.order_id, new.id);
  end loop;

  return new;
end;
$ind$;

-- التريغر المقابل (ترحيل 20260916020000) لم يعد لازمًا وصار ضارًّا:
-- الاسترجاع صار يعكس السجلّ، وفيه سطور الاستهلاك التلقائي. فلو بقي
-- لأعاد المادة مرّتين.
drop trigger if exists trg_restore_indirect_consumption on order_refund_items;

-- ── ٤) بيع الكاشير ──────────────────────────────────────────
drop function if exists complete_pos_order(uuid, bigint, bigint, text, text, numeric, numeric, numeric, numeric, numeric, text, numeric, jsonb, text, bigint, bigint, bigint, text, bigint);

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
  p_platform_invoice_last4 text default null,
  p_customer_id bigint default null,
  p_discount_reason text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $cpo$
declare
  v_order_id bigint;
  v_order_item_id bigint;
  v_business_id bigint := current_business_id();
  v_business record;
  v_vat numeric;
  v_total numeric;
  v_auto_ready boolean;
  v_resolved_customer_id bigint;
  v_menu_item_id bigint;
  v_qty numeric;
  v_is_points_redemption boolean;
  v_points_cost numeric;
  v_total_points_cost numeric := 0;
  v_points_divisor numeric;
  v_points_earned numeric;
  item jsonb;
  dec jsonb;
  dec_row record;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select id into v_order_id from orders where client_order_uuid = p_client_order_uuid;
  if v_order_id is not null then
    return v_order_id;
  end if;

  select * into v_business from businesses where id = v_business_id;

  v_resolved_customer_id := p_customer_id;
  if v_resolved_customer_id is null and p_customer_phone is not null and length(trim(p_customer_phone)) > 0 then
    select id into v_resolved_customer_id from customers
      where business_id = v_business_id and phone = p_customer_phone;
    if v_resolved_customer_id is null then
      insert into customers (business_id, name, phone)
      values (v_business_id, coalesce(nullif(trim(p_customer_name), ''), p_customer_phone), p_customer_phone)
      returning id into v_resolved_customer_id;
    elsif p_customer_name is not null and length(trim(p_customer_name)) > 0 then
      update customers set name = p_customer_name where id = v_resolved_customer_id;
    end if;
  end if;

  select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
    from compute_vat_split(
      p_subtotal - p_discount_amount,
      case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
      coalesce(v_business.prices_include_vat, true)
    ) cvs;

  v_auto_ready := case p_channel
    when 'dine_in' then v_business.auto_ready_dine_in
    when 'pickup' then v_business.auto_ready_pickup
    when 'delivery' then v_business.auto_ready_delivery_platform
    else false
  end;

  insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone, customer_id,
    subtotal, discount_pct, discount_amount, discount_reason, vat_amount, total, payment_method, cash_amount, client_order_uuid,
    channel, delivery_platform_id, table_id, staff_member_id, platform_invoice_last4,
    ready_at, prep_duration_seconds, delivered_at)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone, v_resolved_customer_id,
    p_subtotal, p_discount_pct, p_discount_amount, nullif(trim(p_discount_reason), ''), v_vat, v_total, p_payment_method, p_cash_amount, p_client_order_uuid,
    p_channel, p_delivery_platform_id, p_table_id, p_staff_member_id, p_platform_invoice_last4,
    case when v_auto_ready then now() else null end,
    case when v_auto_ready then 0 else null end,
    case when v_auto_ready and p_channel = 'delivery' then now() else null end)
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(p_items) loop
    v_menu_item_id := nullif(item->>'menu_item_id','')::bigint;
    v_qty := (item->>'qty')::numeric;
    v_is_points_redemption := coalesce((item->>'is_points_redemption')::boolean, false);
    v_points_cost := coalesce((item->>'points_cost')::numeric, 0);
    if v_is_points_redemption and v_points_cost > 0 then
      v_total_points_cost := v_total_points_cost + v_points_cost;
    end if;

    insert into order_items (order_id, menu_item_id, service_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers, cost_at_sale, is_points_redemption, points_spent)
    values (
      v_order_id, v_menu_item_id, nullif(item->>'service_id','')::bigint,
      v_qty, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers',
      case when v_menu_item_id is not null then compute_line_cost(v_menu_item_id, v_qty, item->'box_selections', (item->>'unit_price')::numeric) else null end,
      v_is_points_redemption, v_points_cost
    )
    returning id into v_order_item_id;

    -- كل خصمٍ يُكتب سطره، ومعه السطر الذي سبّبه -- به وحده يستطيع
    -- الاسترجاع أن يعكس ما وقع بدل أن يعيد حسابه.
    if v_menu_item_id is not null then
      for dec_row in select * from resolve_menu_item_recipe_decrements(v_menu_item_id, v_qty) loop
        perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'recipe', v_order_id, v_order_item_id);
      end loop;
      for dec_row in select * from resolve_box_selection_decrements(v_menu_item_id, v_qty, item->'box_selections') loop
        perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'box', v_order_id, v_order_item_id);
      end loop;
      for dec_row in select * from resolve_finished_good_decrement(v_menu_item_id, v_qty) loop
        perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'finished_good', v_order_id, v_order_item_id);
      end loop;
    end if;

    -- خيارات مرتبطة بالمخزون. هذي بالذات كانت تُخصم ولا تُسجَّل، فلا
    -- يجد الاسترجاع لها أثرًا -- وهي الستّون غرامًا الضائعة.
    for dec in select * from jsonb_array_elements(coalesce(item->'stock_decrements', '[]'::jsonb)) loop
      perform rk_stock_move(v_business_id, (dec->>'stock_item_id')::bigint, -(dec->>'qty')::numeric,
                            'sale', 'modifier', v_order_id, v_order_item_id);
    end loop;
  end loop;

  if v_total_points_cost > 0 then
    if v_resolved_customer_id is null then
      raise exception 'customer required for points redemption';
    end if;
    update customers set loyalty_points = loyalty_points - v_total_points_cost
      where id = v_resolved_customer_id and business_id = v_business_id and loyalty_points >= v_total_points_cost;
    if not found then
      raise exception 'insufficient loyalty points';
    end if;
  end if;

  if v_resolved_customer_id is not null then
    v_points_divisor := v_business.loyalty_points_divisor;
    if v_points_divisor is not null and v_points_divisor > 0 then
      v_points_earned := floor(v_total / v_points_divisor);
      if v_points_earned > 0 then
        update customers set loyalty_points = loyalty_points + v_points_earned
          where id = v_resolved_customer_id and business_id = v_business_id;
      end if;
    end if;
  end if;

  if p_table_id is not null then
    update restaurant_tables set status = 'cleaning'
    where id = p_table_id and business_id = v_business_id and status <> 'cleaning';
  end if;

  return v_order_id;
end;
$cpo$;

-- ── ٥) تسجيل طلب طاولة ──────────────────────────────────────
drop function if exists register_dine_in_order(uuid, bigint, bigint, text, text, numeric, numeric, jsonb, bigint, bigint, bigint, bigint);

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
  p_existing_order_id bigint default null,
  p_customer_id bigint default null,
  p_discount_reason text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $rdo$
declare
  v_order_id bigint;
  v_order_item_id bigint;
  v_business_id bigint := current_business_id();
  v_business record;
  v_existing record;
  v_new_subtotal numeric;
  v_discount_pct numeric;
  v_discount_amount numeric;
  v_vat numeric;
  v_total numeric;
  v_menu_item_id bigint;
  v_qty numeric;
  item jsonb;
  dec jsonb;
  dec_row record;
  v_is_points_redemption boolean;
  v_points_cost numeric;
  v_total_points_cost numeric := 0;
  v_redeem_customer_id bigint;
  v_logged_order_id bigint;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select * into v_business from businesses where id = v_business_id;

  if p_customer_id is not null and not exists (
    select 1 from customers where id = p_customer_id and business_id = v_business_id
  ) then
    raise exception 'customer not found';
  end if;

  if p_existing_order_id is not null then
    select order_id into v_logged_order_id from dine_in_round_log where client_order_uuid = p_client_order_uuid;
    if v_logged_order_id is not null then
      return v_logged_order_id;
    end if;

    select * into v_existing from orders where id = p_existing_order_id and business_id = v_business_id and payment_status = 'unpaid';
    if v_existing is null then
      raise exception 'order not found or already paid';
    end if;
    v_order_id := p_existing_order_id;
    v_discount_pct := v_existing.discount_pct;
    v_new_subtotal := v_existing.subtotal + p_subtotal;
    v_redeem_customer_id := v_existing.customer_id;

    select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
      from compute_vat_split(
        v_new_subtotal - round(v_new_subtotal * v_discount_pct / 100, 2),
        case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
        coalesce(v_business.prices_include_vat, true)
      ) cvs;
    v_discount_amount := round(v_new_subtotal * v_discount_pct / 100, 2);

    update orders set subtotal = v_new_subtotal, discount_amount = v_discount_amount, vat_amount = v_vat, total = v_total
      where id = v_order_id;

    insert into dine_in_round_log (client_order_uuid, order_id) values (p_client_order_uuid, v_order_id);
  else
    select id into v_order_id from orders where client_order_uuid = p_client_order_uuid;
    if v_order_id is not null then
      return v_order_id;
    end if;

    v_discount_pct := p_discount_pct;
    v_discount_amount := round(p_subtotal * v_discount_pct / 100, 2);
    v_redeem_customer_id := p_customer_id;
    select cvs.vat_amount, cvs.charged_amount into v_vat, v_total
      from compute_vat_split(
        p_subtotal - v_discount_amount,
        case when coalesce(v_business.vat_registered, true) then coalesce(v_business.vat_rate, 0.15) else 0 end,
        coalesce(v_business.prices_include_vat, true)
      ) cvs;

    insert into orders (business_id, branch_id, shift_id, cashier_id, customer_name, customer_phone, customer_id,
      subtotal, discount_pct, discount_amount, discount_reason, vat_amount, total, payment_method, cash_amount, client_order_uuid,
      channel, table_id, staff_member_id, payment_status, ready_at, prep_duration_seconds)
    values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone, p_customer_id,
      p_subtotal, v_discount_pct, v_discount_amount, nullif(trim(p_discount_reason), ''), v_vat, v_total, null, null, p_client_order_uuid,
      'dine_in', p_table_id, p_staff_member_id, 'unpaid',
      case when v_business.auto_ready_dine_in then now() else null end,
      case when v_business.auto_ready_dine_in then 0 else null end)
    returning id into v_order_id;

    update restaurant_tables set status = 'serving', active_order_id = v_order_id
      where id = p_table_id and business_id = v_business_id;
  end if;

  for item in select * from jsonb_array_elements(p_items) loop
    v_menu_item_id := nullif(item->>'menu_item_id','')::bigint;
    v_qty := (item->>'qty')::numeric;
    v_is_points_redemption := coalesce((item->>'is_points_redemption')::boolean, false);
    v_points_cost := coalesce((item->>'points_cost')::numeric, 0);
    if v_is_points_redemption and v_points_cost > 0 then
      v_total_points_cost := v_total_points_cost + v_points_cost;
    end if;

    insert into order_items (order_id, menu_item_id, service_id, qty, unit_price, modifiers_total, line_total, note, selected_modifiers, cost_at_sale, is_points_redemption, points_spent)
    values (
      v_order_id, v_menu_item_id, nullif(item->>'service_id','')::bigint,
      v_qty, (item->>'unit_price')::numeric,
      (item->>'modifiers_total')::numeric, (item->>'line_total')::numeric, item->>'note', item->'selected_modifiers',
      case when v_menu_item_id is not null then compute_line_cost(v_menu_item_id, v_qty, item->'box_selections', (item->>'unit_price')::numeric) else null end,
      v_is_points_redemption, v_points_cost
    )
    returning id into v_order_item_id;

    if v_menu_item_id is not null then
      for dec_row in select * from resolve_menu_item_recipe_decrements(v_menu_item_id, v_qty) loop
        perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'recipe', v_order_id, v_order_item_id);
      end loop;
      for dec_row in select * from resolve_box_selection_decrements(v_menu_item_id, v_qty, item->'box_selections') loop
        perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'box', v_order_id, v_order_item_id);
      end loop;
      for dec_row in select * from resolve_finished_good_decrement(v_menu_item_id, v_qty) loop
        perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'finished_good', v_order_id, v_order_item_id);
      end loop;
    end if;

    for dec in select * from jsonb_array_elements(coalesce(item->'stock_decrements', '[]'::jsonb)) loop
      perform rk_stock_move(v_business_id, (dec->>'stock_item_id')::bigint, -(dec->>'qty')::numeric,
                            'sale', 'modifier', v_order_id, v_order_item_id);
    end loop;
  end loop;

  if v_total_points_cost > 0 then
    if v_redeem_customer_id is null then
      raise exception 'customer required for points redemption';
    end if;
    update customers set loyalty_points = loyalty_points - v_total_points_cost
      where id = v_redeem_customer_id and business_id = v_business_id and loyalty_points >= v_total_points_cost;
    if not found then
      raise exception 'insufficient loyalty points';
    end if;
  end if;

  return v_order_id;
end;
$rdo$;

-- ── ٥/ب) قبول الطلب الإلكتروني: يمرّ بالسجلّ هو الآخر ───────
-- ترحيل 20260916010000 جعله يخصم، لكنه يخصم مباشرةً بلا تسجيل. فلو
-- استُرجع طلبٌ إلكتروني لسقط في المسار القديم (إعادة حساب من الوصفة)،
-- وهو نفس النقص الذي نعالجه. فيُوحَّد معهم.
create or replace function accept_online_order(p_order_id bigint)
returns table(id bigint, status text)
language plpgsql
security definer
set search_path = public
as $acc$
declare
  v_business_id bigint := current_business_id();
  v_business record;
  v_channel text;
  v_auto_ready boolean;
  v_accepted_id bigint;
  it record;
  dec_row record;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select * into v_business from businesses where businesses.id = v_business_id;
  select orders.channel into v_channel from orders where orders.id = p_order_id and orders.business_id = v_business_id;
  v_auto_ready := case v_channel
    when 'pickup' then v_business.auto_ready_pickup
    when 'delivery' then v_business.auto_ready_delivery_online
    else false
  end;

  update orders set
    status = 'completed',
    cashier_id = auth.uid(),
    ready_at = case when v_auto_ready then now() else orders.ready_at end,
    prep_duration_seconds = case when v_auto_ready then extract(epoch from (now() - orders.created_at))::int else orders.prep_duration_seconds end
  where orders.id = p_order_id
    and orders.business_id = v_business_id
    and orders.status = 'pending'
  returning orders.id into v_accepted_id;

  if v_accepted_id is null then
    raise exception 'الطلب غير متاح للقبول — يمكن تم التعامل معه من جهاز آخر';
  end if;

  for it in
    select oi.id as oi_id, oi.menu_item_id, oi.qty
    from order_items oi
    where oi.order_id = v_accepted_id and oi.menu_item_id is not null
  loop
    for dec_row in select * from resolve_menu_item_recipe_decrements(it.menu_item_id, it.qty) loop
      perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'recipe', v_accepted_id, it.oi_id);
    end loop;
    for dec_row in select * from resolve_finished_good_decrement(it.menu_item_id, it.qty) loop
      perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty, 'sale', 'finished_good', v_accepted_id, it.oi_id);
    end loop;
  end loop;

  return query select v_accepted_id, 'completed'::text;
end;
$acc$;

-- ── ٦) الاسترجاع: يعكس ما وقع، لا يُعيد حسابه ────────────────
create or replace function refund_pos_order_lines(
  p_order_id bigint,
  p_lines jsonb,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $rf$
declare
  v_business_id bigint;
  v_order record;
  v_refund_id bigint;
  v_gross numeric := 0;
  v_amount numeric := 0;
  v_line jsonb;
  v_item record;
  v_take numeric;
  v_left numeric;
  v_dec record;
  v_mv record;
  v_had_ledger boolean;
  v_count int := 0;
  v_shift_id bigint;
  v_new_total numeric;
  v_full boolean;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not (has_permission('pos:register') or has_permission('screen:orders')) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_order from orders where id = p_order_id and business_id = v_business_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;
  if v_order.status not in ('completed', 'partially_refunded') then
    return jsonb_build_object('ok', false, 'error', 'not_refundable');
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_refund');
  end if;

  select id into v_shift_id from shifts
  where business_id = v_business_id and closed_at is null
  order by opened_at desc limit 1;

  insert into order_refunds (business_id, order_id, shift_id, amount, kind, reason)
  values (v_business_id, p_order_id, v_shift_id, 0, 'lines',
          nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into v_refund_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select oi.* into v_item
    from order_items oi
    where oi.id = (v_line->>'orderItemId')::bigint and oi.order_id = p_order_id;
    if not found then continue; end if;

    v_left := v_item.qty - order_item_refunded_qty(v_item.id);
    v_take := least(coalesce((v_line->>'qty')::numeric, v_item.qty), v_left);
    if v_take is null or v_take <= 0 then continue; end if;

    insert into order_refund_items (refund_id, order_item_id, menu_item_id, qty, amount)
    values (v_refund_id, v_item.id, v_item.menu_item_id, v_take,
            round(coalesce(v_item.unit_price, 0) * v_take, 2));
    v_gross := v_gross + round(coalesce(v_item.unit_price, 0) * v_take, 2);
    v_count := v_count + 1;

    -- العكس من السجلّ: كل ما خُصم لهذا السطر، بنسبة المرتجَع من كميته.
    -- يشمل الوصفة والخيارات والبوكس والصنف الجاهز والاستهلاك التلقائي
    -- معًا -- بلا أن تعرف هذي الدالة شيئًا عن مصادرها.
    v_had_ledger := false;
    for v_mv in
      select sm.stock_item_id, sum(sm.delta) as d
      from stock_movements sm
      where sm.order_item_id = v_item.id
        and sm.delta < 0
        and sm.reason in ('sale', 'indirect')
      group by sm.stock_item_id
    loop
      v_had_ledger := true;
      perform rk_stock_move(v_business_id, v_mv.stock_item_id,
                            (-v_mv.d) * (v_take / nullif(v_item.qty, 0)),
                            'refund', 'reversal', p_order_id, v_item.id);
    end loop;

    -- طلبات ما قبل السجلّ: لا سطور تُعكس، فيُعاد الحساب كما كان يُفعل.
    -- ناقصٌ كما كان (لا يعرف الخيارات)، لكنه أصدق من لا شيء.
    if not v_had_ledger and v_item.menu_item_id is not null then
      for v_dec in select * from resolve_menu_item_recipe_decrements(v_item.menu_item_id, v_take) loop
        perform rk_stock_move(v_business_id, v_dec.stock_item_id, v_dec.qty,
                              'refund', 'recipe_legacy', p_order_id, v_item.id);
      end loop;
      for v_dec in select * from resolve_finished_good_decrement(v_item.menu_item_id, v_take) loop
        perform rk_stock_move(v_business_id, v_dec.stock_item_id, v_dec.qty,
                              'refund', 'finished_good_legacy', p_order_id, v_item.id);
      end loop;
    end if;
  end loop;

  if v_count = 0 then
    delete from order_refunds where id = v_refund_id;
    return jsonb_build_object('ok', false, 'error', 'nothing_left_to_refund');
  end if;

  v_amount := round(v_gross * (1 - coalesce(v_order.discount_pct, 0) / 100.0), 2);
  v_amount := least(v_amount, v_order.total - coalesce(v_order.refunded_amount, 0));
  if v_amount < 0 then v_amount := 0; end if;
  update order_refunds set amount = v_amount where id = v_refund_id;

  v_new_total := coalesce(v_order.refunded_amount, 0) + v_amount;
  v_full := v_new_total >= v_order.total - 0.001;

  if v_order.customer_id is not null then
    declare
      v_units numeric := 0;
    begin
      select coalesce(sum(ri.qty), 0) into v_units
      from order_refund_items ri
      join order_items oi on oi.id = ri.order_item_id
      join menu_items mi on mi.id = oi.menu_item_id
      where ri.refund_id = v_refund_id
        and coalesce(oi.is_points_redemption, false) = false
        and coalesce(oi.is_free_reward, false) = false
        and exists (
          select 1 from loyalty_program_items lpi
          where lpi.business_id = v_business_id
            and lpi.role = 'counts'
            and (lpi.menu_item_id = mi.id or lpi.category_id = mi.category_id)
        );
      perform claw_back_loyalty_for_refund(
        v_order.customer_id, v_business_id, v_units,
        case when v_full then 1 else 0 end, v_amount);
    end;
  end if;

  update orders set
    refunded_amount = v_new_total,
    refunded_at = now(),
    refund_shift_id = coalesce(refund_shift_id, v_shift_id),
    status = case when v_full then 'refunded' else 'partially_refunded' end
  where id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'refundId', v_refund_id,
    'amount', v_amount,
    'refundedTotal', v_new_total,
    'remaining', greatest(v_order.total - v_new_total, 0),
    'full', v_full,
    'lines', v_count
  );
end;
$rf$;
revoke all on function refund_pos_order_lines(bigint, jsonb, text) from public, anon;
grant execute on function refund_pos_order_lines(bigint, jsonb, text) to authenticated;
