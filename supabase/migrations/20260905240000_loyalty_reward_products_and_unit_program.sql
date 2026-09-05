-- نظام الولاء: مكافأةٌ لها منتج، وبرنامجٌ يعدّ الأكواب.
--
-- ثلاثة أنظمة، يشغّل المطعم واحداً منها:
--
--   points   -- ريالٌ يصير نقطة، والنقاط تُستبدل خصماً.
--   visits   -- كل ن فاتورة (فوق حدٍّ) = مكافأة.
--   products -- كل ن كوباً من قهوة = كوبٌ مجاني. الجديد هنا.
--
-- وفرق الثالث عن الثاني ليس في العدّ بل فيما يُعدّ: الزيارة ورقةٌ
-- واحدة مهما حملت، والكوب واحدٌ من عشرة في ورقة واحدة. فالكمية تُجمع
-- هنا، والفواتير تُعدّ هناك.

-- ============ ما الذي يُعدّ، وما الذي يُعطى ============
--
-- قائمتان لا عمودان: المطعم يعدّ تصنيفاً كاملاً وقد يضمّ إليه صنفاً من
-- تصنيف آخر، ويعطي مكافأةً من صنف أو من عدة أصناف. والعمود الواحد لا
-- يحمل قائمة.
--
-- role يفرّق بين القائمتين في جدول واحد لأنهما شيء واحد في بنيتهما
-- ومكانهما وصلاحياتهما: أصنافٌ منسوبة إلى برنامج ولاء منشأة.
--
--   counts  -- يُحسب في العدّاد. تصنيف أو صنف.
--   reward  -- يُعطى مجاناً. صنفٌ بعينه لا تصنيف: الكاشير يسلّم شيئاً
--              محدداً، و"أي شيء من الحلويات" ليس تسليماً بل تفاوضاً.
create table if not exists loyalty_program_items (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  role text not null check (role in ('counts', 'reward')),
  -- أحدهما لا كلاهما: صفٌّ يشير إلى تصنيف ومنتج معاً لا معنى له.
  category_id bigint references menu_categories(id) on delete cascade,
  menu_item_id bigint references menu_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint loyalty_program_items_one_target check (
    (category_id is not null and menu_item_id is null)
    or (category_id is null and menu_item_id is not null)
  ),
  -- والمكافأة صنفٌ دائماً: تصنيفٌ كامل ليس مكافأة يسلّمها كاشير.
  constraint loyalty_program_items_reward_is_item check (
    role <> 'reward' or menu_item_id is not null
  )
);

create index if not exists loyalty_program_items_business_idx
  on loyalty_program_items(business_id, role);
-- لا يُضاف الصنف مرتين إلى القائمة نفسها.
create unique index if not exists loyalty_program_items_unique_item
  on loyalty_program_items(business_id, role, menu_item_id) where menu_item_id is not null;
create unique index if not exists loyalty_program_items_unique_cat
  on loyalty_program_items(business_id, role, category_id) where category_id is not null;

alter table loyalty_program_items enable row level security;

-- المالك يكتب، ونقطة البيع تقرأ: الكاشير يحتاج أن يعرف ماذا يسلّم،
-- ولا يحتاج أن يغيّر شروط العرض.
drop policy if exists loyalty_program_items_read on loyalty_program_items;
create policy loyalty_program_items_read on loyalty_program_items
  for select using (business_id = current_business_id());

drop policy if exists loyalty_program_items_write on loyalty_program_items;
create policy loyalty_program_items_write on loyalty_program_items
  for all using (business_id = current_business_id() and has_permission('settings:edit'))
  with check (business_id = current_business_id() and has_permission('settings:edit'));

-- ============ أعمدة البرنامج ============

-- النوع الثالث. والقائمة نفسها مكرّرة في لوحة التحكم ونقطة البيع
-- والتطبيق -- من زاد نوعاً زاده في الأربعة.
do $ltype$
begin
  if exists (select 1 from pg_constraint where conname = 'businesses_loyalty_system_type_check') then
    alter table businesses drop constraint businesses_loyalty_system_type_check;
  end if;
  alter table businesses
    add constraint businesses_loyalty_system_type_check
    check (loyalty_system_type in ('points', 'visits', 'products'));
end $ltype$;

alter table businesses
  add column if not exists loyalty_unit_threshold int not null default 6
  check (loyalty_unit_threshold > 0);

comment on column businesses.loyalty_unit_threshold is
  'كم وحدة (كوباً/قطعة) من أصناف البرنامج قبل المكافأة، في نظام products.';

-- كيف تُسلَّم المكافأة.
--
--   open     -- الكاشير يقرر. مرنٌ ومفتوح على الخطأ والمجاملة.
--   products -- من قائمة reward وحدها. الكاشير يضغط ولا يختار، فيخرج
--               الصنف نفسه في كل فرع وكل وردية، ويُخصم من المخزون
--               كأي بيع -- وهو ما لا يفعله بندٌ مكتوب بخط اليد.
alter table businesses
  add column if not exists loyalty_reward_mode text not null default 'open'
  check (loyalty_reward_mode in ('open', 'products'));

-- عدّاد الوحدات، مستقل عن عدّاد الزيارات: المطعم يبدّل بين النظامين
-- ولا يجوز أن يرث أحدهما رصيد الآخر.
alter table customers
  add column if not exists loyalty_units int not null default 0;

-- ============ المنح ============
--
-- يُستبدل بنظيره ذي المعامل الرابع: نظام الأصناف يحتاج أن يعرف ماذا
-- في الفاتورة، لا كم بلغت.
drop function if exists award_loyalty_for_order(bigint, bigint, numeric);

create or replace function award_loyalty_for_order(
  p_business_id bigint,
  p_customer_id bigint,
  p_total numeric,
  p_order_id bigint default null
) returns void
language plpgsql
security definer
set search_path = public
as $award$
declare
  v_biz record;
  v_visits_after int;
  v_points int;
  v_units numeric;
  v_units_after int;
begin
  if p_customer_id is null then return; end if;
  select * into v_biz from businesses where id = p_business_id;
  if not found then return; end if;
  if coalesce(v_biz.loyalty_enabled, true) = false then return; end if;

  if v_biz.loyalty_system_type = 'visits' then
    -- الحدّ على الإجمالي المحسوب في الخادم، لا على رقم أرسله العميل.
    if p_total < coalesce(v_biz.loyalty_visit_min_total, 0) then return; end if;

    update customers set loyalty_visits = loyalty_visits + 1
      where id = p_customer_id and business_id = p_business_id
      returning loyalty_visits into v_visits_after;

    -- يُطرح الحدّ ولا يُصفَّر العدّاد: من بلغ السابعة والحدّ ستٌّ يبقى
    -- له واحدة، والتصفير يبتلعها.
    if v_visits_after >= v_biz.loyalty_visits_threshold then
      update customers set
        loyalty_visits = loyalty_visits - v_biz.loyalty_visits_threshold,
        loyalty_free_rewards = loyalty_free_rewards + 1
      where id = p_customer_id and business_id = p_business_id;
    end if;

  elsif v_biz.loyalty_system_type = 'products' then
    if p_order_id is null then return; end if;

    -- تُجمع الكميات لا تُعدّ السطور: ستة أكواب في فاتورة واحدة ستةٌ
    -- لا واحد. وهذا هو الفرق كله بين هذا النظام ونظام الزيارات.
    --
    -- والمجاني لا يُعدّ: كوبٌ خرج مكافأةً لا يقرّب صاحبه من التالية،
    -- وإلا موّل العرضُ نفسه بلا نهاية.
    --
    -- والانتساب بالصنف أو بتصنيفه: المطعم يعدّ "القهوة" كلها ثم يضمّ
    -- إليها صنفاً من تصنيف آخر، فالشرطان معاً لا أحدهما.
    select coalesce(sum(oi.qty), 0) into v_units
    from order_items oi
    join menu_items mi on mi.id = oi.menu_item_id
    where oi.order_id = p_order_id
      and coalesce(oi.is_points_redemption, false) = false
      and exists (
        select 1 from loyalty_program_items lpi
        where lpi.business_id = p_business_id
          and lpi.role = 'counts'
          and (lpi.menu_item_id = mi.id or lpi.category_id = mi.category_id)
      );

    if v_units <= 0 then return; end if;

    update customers set loyalty_units = loyalty_units + v_units::int
      where id = p_customer_id and business_id = p_business_id
      returning loyalty_units into v_units_after;

    -- فاتورةٌ تحمل اثني عشر كوباً والحدّ ستٌّ تمنح مكافأتين، لا واحدة.
    while v_units_after >= v_biz.loyalty_unit_threshold loop
      update customers set
        loyalty_units = loyalty_units - v_biz.loyalty_unit_threshold,
        loyalty_free_rewards = loyalty_free_rewards + 1
      where id = p_customer_id and business_id = p_business_id
      returning loyalty_units into v_units_after;
    end loop;

  elsif v_biz.loyalty_system_type = 'points' then
    if coalesce(v_biz.loyalty_points_divisor, 0) > 0 then
      v_points := floor(p_total / v_biz.loyalty_points_divisor);
      if v_points > 0 then
        update customers set loyalty_points = loyalty_points + v_points
          where id = p_customer_id and business_id = p_business_id;
      end if;
    end if;
  end if;
end;
$award$;

revoke all on function award_loyalty_for_order(bigint, bigint, numeric, bigint) from public, anon;

-- ============ ويُمرَّر رقم الطلب ============
--
-- الدالة أدناه منسوخة حرفياً من تعريفها الأخير بأداة لا بيد، ولم يتغيّر
-- فيها إلا معامل النداء -- فما سقط منها مرتين من قبل لا يسقط ثالثة.

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
  p_customer_id bigint default null
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
  v_auto_ready boolean;
  v_resolved_customer_id bigint;
  v_clean_phone text;
  v_menu_item_id bigint;
  v_qty numeric;
  v_is_points_redemption boolean;
  v_points_cost numeric;
  v_total_points_cost numeric := 0;
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
  v_clean_phone := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  if v_resolved_customer_id is null and v_clean_phone ~ '^05\d{8}$' then
    select id into v_resolved_customer_id from customers
      where business_id = v_business_id and phone = v_clean_phone;
    if v_resolved_customer_id is null then
      insert into customers (business_id, name, phone)
      values (v_business_id, coalesce(nullif(trim(p_customer_name), ''), v_clean_phone), v_clean_phone)
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
    subtotal, discount_pct, discount_amount, vat_amount, total, payment_method, cash_amount, client_order_uuid,
    channel, delivery_platform_id, table_id, staff_member_id, platform_invoice_last4,
    ready_at, prep_duration_seconds, delivered_at)
  values (v_business_id, p_branch_id, p_shift_id, auth.uid(), p_customer_name, p_customer_phone, v_resolved_customer_id,
    p_subtotal, p_discount_pct, p_discount_amount, v_vat, v_total, p_payment_method, p_cash_amount, p_client_order_uuid,
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
    );

    if v_menu_item_id is not null then
      for dec_row in select * from resolve_menu_item_recipe_decrements(v_menu_item_id, v_qty) loop
        update stock_items set qty_on_hand = qty_on_hand - dec_row.qty, updated_at = now()
        where id = dec_row.stock_item_id and business_id = v_business_id;
      end loop;
      for dec_row in select * from resolve_box_selection_decrements(v_menu_item_id, v_qty, item->'box_selections') loop
        update stock_items set qty_on_hand = qty_on_hand - dec_row.qty, updated_at = now()
        where id = dec_row.stock_item_id and business_id = v_business_id;
      end loop;
      for dec_row in select * from resolve_finished_good_decrement(v_menu_item_id, v_qty) loop
        update stock_items set qty_on_hand = qty_on_hand - dec_row.qty, updated_at = now()
        where id = dec_row.stock_item_id and business_id = v_business_id;
      end loop;
    end if;

    for dec in select * from jsonb_array_elements(coalesce(item->'stock_decrements', '[]'::jsonb)) loop
      update stock_items set qty_on_hand = qty_on_hand - (dec->>'qty')::numeric, updated_at = now()
      where id = (dec->>'stock_item_id')::bigint and business_id = v_business_id;
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

  -- السطر الذي سقط مرتين. صار نداءً واحداً لا كتلة تُنسخ.
  perform award_loyalty_for_order(v_business_id, v_resolved_customer_id, v_total, v_order_id);

  if p_table_id is not null then
    update restaurant_tables set status = 'cleaning'
    where id = p_table_id and business_id = v_business_id and status <> 'cleaning';
  end if;

  return v_order_id;
end;
$$;
