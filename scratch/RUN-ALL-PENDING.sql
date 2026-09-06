-- ============================================================
--  ركين — كل الترحيلات المعلّقة، في ملف واحد
--  التاريخ: 2026-09-06
--
--  شغّله مرةً كاملاً. آمنٌ لو أُعيد، وآمنٌ لو كنتَ شغّلت بعضه:
--  كل جدول وعمود وفهرس فيه if not exists، وكل مشغّل وسياسة مسبوقان
--  بـ drop if exists، وكل دالة create or replace. فلا يُنشئ مكرراً
--  ولا يُسقط بيانات.
--
--  والترتيب مقصود: كلٌّ يبني على ما قبله.
--    1) قيد ثيم الفاتورة الرابع
--    2) إعادة كسب النقاط والزيارات + الحد الأدنى للفاتورة
--    3) نظام الأكواب + ربط المكافأة بمنتج
--    4) استبدال المكافأة
--    5) إحصاءات برنامج الولاء
--    6) بطاقات محفظة آبل
--    7) شاشة العميل ورموز الإضافة
-- ============================================================

begin;



-- ============ (1/7) 20260905220000_receipt_theme_signature ============

-- الثيم الرابع لم يكن مسموحاً به في القاعدة.
--
-- أُضيف ثيم "فخم" (signature) إلى الداشبورد وإلى نقطة البيع وإلى
-- التطبيق، وبقي قيد القاعدة على ثلاثة كما كُتب أول مرة. فكان اختياره
-- من لوحة التحكم يسقط عند الحفظ برسالة:
--
--   new row for relation "businesses" violates check constraint
--   "businesses_receipt_theme_check"
--
-- وأثره لم يقف عند رسالة خطأ: الحفظ يفشل، فيبقى في العمود ما كان
-- قبله، فتطبع الفاتورة بثيم لم يعد أحد يختاره -- وهو ما بدا "الفاتورة
-- لا تطابق ما اخترته في لوحة التحكم".
--
-- ولا مصدر واحد لهذه القائمة: هي مكرّرة في أربعة مواضع مستقلة (القيد
-- هنا، RECEIPT_THEMES في rakeen-dashboard.js، ومثلها في rakeen-pos.js،
-- وTHEMES في react-native-poc/src/domain/receiptTheme.ts). فمن زاد
-- ثيماً زاده في أربعة، أو كسر الحفظ.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'businesses_receipt_theme_check'
  ) then
    alter table businesses drop constraint businesses_receipt_theme_check;
  end if;

  alter table businesses
    add constraint businesses_receipt_theme_check
    check (receipt_theme in ('classic', 'compact', 'elegant', 'signature'));
end $$;

comment on column businesses.receipt_theme is
  'classic | compact | elegant | signature. القائمة نفسها مكرّرة في rakeen-dashboard.js و rakeen-pos.js و react-native-poc/src/domain/receiptTheme.ts -- أي ثيم جديد يُضاف في الأربعة معاً.';


-- ============ (2/7) 20260905230000_restore_loyalty_earning_and_visit_minimum ============

-- الولاء لا يكسب شيئاً. لا نقاط ولا زيارات.
--
-- complete_pos_order تُعاد كتابتها كاملةً مع كل تعديل -- تُنسخ الدالة
-- بطولها ويُغيَّر فيها موضع. وكل جزء ينساه الناسخ يختفي بلا إنذار: لا
-- خطأ، ولا اختبار يسقط، ولا شيء إلا زبون يسأل لماذا بطاقته على صفر.
--
-- وقد وقع هذا مرتين في يومين. الأولى أُصلحت بترحيل اسمه
-- restore_complete_pos_order_loyalty_points_earning في الأول من سبتمبر،
-- والثانية في الثالث منه حين أُعيدت كتابة الدالة لتحقق رقم الجوال --
-- فسقط الكسب معها ثانيةً، وبقي الخصم عند الاستبدال وحده. أي أن الزبون
-- يصرف ولا يكسب.
--
-- فالعلاج ليس إعادة الكتلة مرة ثالثة، بل إخراجها من طريق النسخ:
-- award_loyalty_for_order دالةٌ مستقلة، وcomplete_pos_order تناديها في
-- سطر واحد. ومن أعاد كتابة الدالة بعد اليوم فأسقط سطراً واحداً ظاهراً
-- فهو غير من أسقط كتلةً مدفونة في مئة وسبعين سطراً.

-- حدٌّ أدنى لقيمة الفاتورة حتى تُحتسب زيارة.
-- كانت الزيارة تُحتسب لأي طلب ولو بريال، فبطاقة العشر زيارات تُملأ
-- بعشر مياه. صفرٌ افتراضاً = السلوك القديم بلا تغيير لمن لم يضبطه.
alter table businesses
  add column if not exists loyalty_visit_min_total numeric not null default 0
  check (loyalty_visit_min_total >= 0);

comment on column businesses.loyalty_visit_min_total is
  'أقل إجمالي فاتورة تُحتسب عنده زيارة في نظام الزيارات. 0 = كل فاتورة تُحتسب.';

create or replace function award_loyalty_for_order(
  p_business_id bigint,
  p_customer_id bigint,
  p_total numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_biz record;
  v_visits_after int;
  v_points int;
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
$$;

revoke all on function award_loyalty_for_order(bigint, bigint, numeric) from public, anon;

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
  perform award_loyalty_for_order(v_business_id, v_resolved_customer_id, v_total);

  if p_table_id is not null then
    update restaurant_tables set status = 'cleaning'
    where id = p_table_id and business_id = v_business_id and status <> 'cleaning';
  end if;

  return v_order_id;
end;
$$;


-- ============ (3/7) 20260905240000_loyalty_reward_products_and_unit_program ============

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


-- ============ (4/7) 20260906010000_redeem_free_reward ============

-- استبدال المكافأة المجانية: معاملةٌ واحدة لا يُخترق فيها شيء.
--
-- الزبون يجمع loyalty_free_rewards منذ أول ترحيل للزيارات، ولم يكن في
-- التطبيق سطرٌ واحد يصرفها. يُكسب ولا يُصرف.
--
-- والصرف هنا لا يُترك للعميل ولا للكاشير وحده: يُطلب من الكاشير،
-- ويؤكّده صاحب البطاقة من جواله عبر loyalty_redemption_requests -- وهي
-- الآلية القائمة نفسها لاستبدال النقاط، لا آليةٌ ثانية تُخترع لها
-- شاشاتها وأعطالها.
--
-- وكل تحقّق يقع في الخادم داخل معاملة واحدة، لأن كلاً منها يُخترق من
-- العميل لو وقع عنده:
--
--   1. أن الطلب مؤكَّد فعلاً، ولهذا الزبون، ولم ينتهِ وقته.
--   2. أن الطلب لم يُستهلك من قبل -- وإلا فُتحت مكافأة واحدة مرتين
--      بضغطتين متتاليتين على زرٍّ واحد.
--   3. أن للزبون رصيداً.
--   4. أن الصنف مما يُعطى، حين يكون العرض مقيّداً بأصناف.
--
-- والرابع هو "القيد" الذي طُلب: الكاشير يضغط ولا يختار. وهو محفوظٌ هنا
-- لا في الشاشة، لأن الشاشة تُعدّل والخادم لا يُعدَّل.

alter table loyalty_redemption_requests
  add column if not exists consumed_at timestamptz;

comment on column loyalty_redemption_requests.consumed_at is
  'متى صُرف هذا الطلب فعلاً. يمنع صرف التأكيد الواحد مرتين.';

create or replace function redeem_free_reward(
  p_customer_id bigint,
  p_request_id bigint,
  p_menu_item_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $redeem$
declare
  v_business_id bigint;
  v_biz record;
  v_ok boolean;
  v_left int;
begin
  v_business_id := current_business_id();
  if v_business_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_business');
  end if;
  if not has_permission('pos:register') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_biz from businesses where id = v_business_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_business');
  end if;

  -- (1) و(2) معاً: الطلب يُستهلك بنفس الجملة التي تتحقق منه، فلا تقع
  -- بين الفحص والاستهلاك لحظةٌ يمرّ فيها طلبٌ ثانٍ.
  update loyalty_redemption_requests
  set consumed_at = now()
  where id = p_request_id
    and customer_id = p_customer_id
    and business_id = v_business_id
    and status = 'confirmed'
    and consumed_at is null
  returning true into v_ok;

  if v_ok is null then
    return jsonb_build_object('ok', false, 'error', 'request_not_confirmed');
  end if;

  -- (4) قبل الخصم: لا يُخصم رصيدٌ لصنفٍ سيُرفض.
  if v_biz.loyalty_reward_mode = 'products' then
    if p_menu_item_id is null then
      return jsonb_build_object('ok', false, 'error', 'item_required');
    end if;
    if not exists (
      select 1 from loyalty_program_items
      where business_id = v_business_id
        and role = 'reward'
        and menu_item_id = p_menu_item_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'item_not_a_reward');
    end if;
  end if;

  -- (3) الشرط في الجملة لا قبلها: رصيدٌ يُقرأ ثم يُخصم يُخصم مرتين إذا
  -- وقع نداءان معاً.
  update customers
  set loyalty_free_rewards = loyalty_free_rewards - 1
  where id = p_customer_id
    and business_id = v_business_id
    and loyalty_free_rewards >= 1
  returning loyalty_free_rewards into v_left;

  if v_left is null then
    return jsonb_build_object('ok', false, 'error', 'no_rewards_left');
  end if;

  return jsonb_build_object('ok', true, 'remaining', v_left);
end;
$redeem$;

revoke all on function redeem_free_reward(bigint, bigint, bigint) from public, anon;
grant execute on function redeem_free_reward(bigint, bigint, bigint) to authenticated;

-- ============ والمجاني لا يُعدّ ============
--
-- الصنف المجاني يدخل الفاتورة بسعر صفر ويُخصم من المخزون كأي بيع --
-- وهذا هو المقصود. لكنه كان سيُحسب في عدّاد المكافأة التالية، فيموّل
-- العرضُ نفسه: كوبٌ مجاني يقرّب من كوبٍ مجاني.
--
-- والعلامة الموجودة is_points_redemption تعني في أصلها "هذا السطر
-- أُعطي ولم يُبَع"، وaward_loyalty_for_order تستثنيه بها أصلاً. فيُرسله
-- التطبيق بها وبـpoints_cost = 0 -- فلا نقاط تُخصم، ولا وحدة تُعدّ.
-- علامةٌ ثانية بمعنى واحد أسوأ من واحدة تُستعمل في موضعيها.
comment on column order_items.is_points_redemption is
  'هذا السطر أُعطي لا بِيع: استبدال نقاط، أو مكافأة ولاء مجانية. يُستثنى من عدّ الولاء في award_loyalty_for_order، وسعره صفر.';


-- ============ (5/7) 20260906020000_loyalty_program_stats ============

-- إحصاءات البرنامج، محسوبةً في القاعدة.
--
-- صفحة الولاء كانت تعرض أرقام النقاط مهما كان النظام: "نقاط مصدرة
-- اليوم" لمطعمٍ يشغّل بطاقة ختم رقمٌ لا يعني شيئاً، و"متوسط نقاط
-- العميل" صفرٌ دائماً عنده. فالصفحة تصف برنامجاً غير الذي يشغّله.
--
-- والحساب هنا لا في المتصفح: هذه تجميعاتٌ على جدول الزبائن كله، وجلبُه
-- إلى الصفحة ليُجمع فيها يجلب ألف صف ليُخرج منها أربعة أرقام -- ويقف
-- عند حدّ الصفحة الأول فيكذب على من تجاوز عملاؤه ذلك الحدّ.
--
-- ويُرجع الثلاثة معاً لا واحداً حسب النظام: النظام يُبدَّل، والصفحة
-- تعرض ما يخصّ المختار الآن بلا نداءٍ ثانٍ عند كل تبديل.

create or replace function get_loyalty_program_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $stats$
declare
  v_business_id bigint;
  v_biz record;
  v_out jsonb;
begin
  v_business_id := current_business_id();
  if v_business_id is null then
    return jsonb_build_object('error', 'no_business');
  end if;
  -- إحصاءات المنشأة يقرؤها من يملك رؤية تقاريرها، لا كل من دخل.
  if not has_permission('reports:view') then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_biz from businesses where id = v_business_id;
  if not found then
    return jsonb_build_object('error', 'no_business');
  end if;

  select jsonb_build_object(
    'systemType', v_biz.loyalty_system_type,
    'members', count(*),
    -- مكافآتٌ كُسبت ولم تُصرف. وهي التزامٌ قائم على المطعم لا رقم
    -- إنجاز: كل واحدة منها كوبٌ سيُعطى ولم يُعطَ بعد.
    'rewardsReady', coalesce(sum(c.loyalty_free_rewards), 0),
    'pointsOutstanding', coalesce(sum(c.loyalty_points), 0),
    -- بطاقةٌ بدأت ولم تكتمل. ومن لم يبدأ ليس في البرنامج بعد.
    'visitsActive', count(*) filter (where c.loyalty_visits > 0),
    'unitsActive', count(*) filter (where c.loyalty_units > 0),
    -- من بقيت له واحدة. وهؤلاء هم من تُرسَل إليهم رسالة، لا الجميع.
    'visitsNearReward', count(*) filter (
      where v_biz.loyalty_visits_threshold > 0
        and c.loyalty_visits >= v_biz.loyalty_visits_threshold - 1
        and c.loyalty_visits < v_biz.loyalty_visits_threshold
    ),
    'unitsNearReward', count(*) filter (
      where v_biz.loyalty_unit_threshold > 0
        and c.loyalty_units >= v_biz.loyalty_unit_threshold - 1
        and c.loyalty_units < v_biz.loyalty_unit_threshold
    ),
    'visitsSum', coalesce(sum(c.loyalty_visits), 0),
    'unitsSum', coalesce(sum(c.loyalty_units), 0),
    'visitsThreshold', v_biz.loyalty_visits_threshold,
    'unitsThreshold', v_biz.loyalty_unit_threshold
  ) into v_out
  from customers c
  where c.business_id = v_business_id;

  return v_out;
end;
$stats$;

revoke all on function get_loyalty_program_stats() from public, anon;
grant execute on function get_loyalty_program_stats() to authenticated;


-- ============ (6/7) 20260906030000_wallet_passes ============

-- بطاقات المحفظة: أي جهاز يحمل بطاقة أي زبون.
--
-- بطاقة Apple Wallet لا تسأل الخادم عن جديدها. الخادم هو الذي يوقظها:
-- يرسل إشعاراً إلى الجهاز فيطلب الجهاز النسخة المحدّثة. وليفعل ذلك
-- لا بدّ أن يعرف أي الأجهزة تحمل أي بطاقة -- وهذا الجدول.
--
-- والجهاز الواحد يحمل بطاقات لزبائن كثر (جهاز الكاشير مثلاً)، والزبون
-- الواحد يضع بطاقته في أجهزة عدة. فالعلاقة كثيرٌ إلى كثير، ومفتاحها
-- الزوج لا أحدهما.
--
-- ولا يُنشأ الصف إلا حين يضيف صاحب الجهاز البطاقة فعلاً: آبل تنادي
-- نقطة التسجيل من الجهاز نفسه بعد الإضافة، لا نحن.
create table if not exists wallet_pass_registrations (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  business_id bigint not null references businesses(id) on delete cascade,
  /** معرّف مكتبة البطاقات على ذلك الجهاز. تعطيه آبل، ولا يعرّف الجهاز
   *  إلا عندنا -- ليس UDID ولا شيئاً يتتبّع صاحبه. */
  device_library_id text not null,
  /** الرمز الذي يُرسل به الإشعار إلى هذا الجهاز. */
  push_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- الزوج هو المفتاح: إعادة التسجيل تحدّث الرمز ولا تُنشئ صفاً ثانياً.
create unique index if not exists wallet_pass_registrations_pair
  on wallet_pass_registrations(device_library_id, customer_id);
-- ومن هنا يُقرأ: "من يحمل بطاقة هذا الزبون؟" عند كل تغيّر في رصيده.
create index if not exists wallet_pass_registrations_customer
  on wallet_pass_registrations(customer_id);

alter table wallet_pass_registrations enable row level security;

-- لا سياسة تسمح لأحد: هذا الجدول لا يمسّه إلا الخادم بمفتاح الخدمة،
-- ونقاط PassKit تُصادَق بـauthenticationToken الخاص بالبطاقة لا بجلسة
-- مستخدم. وصمتُ السياسات هنا هو المنع، لا سهوٌ عنها.

/**
 * متى تغيّر ما يُعرض على البطاقة.
 *
 * آبل تسأل: "ما الذي تغيّر بعد هذا الوقت؟" فيلزم وقتٌ يُقارَن به. وهو
 * على الزبون لا على التسجيل: البطاقة واحدة وإن حملتها عشرة أجهزة.
 */
alter table customers
  add column if not exists wallet_pass_updated_at timestamptz not null default now();

-- ويتغيّر مع كل ما يظهر على وجه البطاقة -- الرصيد والزيارات والوحدات.
create or replace function touch_wallet_pass_updated_at()
returns trigger
language plpgsql
as $touch$
begin
  if new.loyalty_points is distinct from old.loyalty_points
     or new.loyalty_visits is distinct from old.loyalty_visits
     or new.loyalty_units is distinct from old.loyalty_units
     or new.loyalty_free_rewards is distinct from old.loyalty_free_rewards then
    new.wallet_pass_updated_at := now();
  end if;
  return new;
end;
$touch$;

drop trigger if exists customers_wallet_pass_touch on customers;
create trigger customers_wallet_pass_touch
  before update on customers
  for each row execute function touch_wallet_pass_updated_at();

/**
 * ما تعرضه البطاقة، بمفتاحها العام وحده.
 *
 * تُنادى من مسار الخادم بمفتاح الخدمة بعد أن يتحقق من
 * authenticationToken، فلا تفترض جلسةً ولا صلاحية. وتُرجع ما يُطبع على
 * وجه البطاقة لا أكثر: لا هاتف، ولا اسم موظف، ولا تاريخ ميلاد.
 */
create or replace function get_wallet_pass_data(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $wallet$
declare
  v_out jsonb;
begin
  select jsonb_build_object(
    'customerId', c.id,
    'businessId', b.id,
    'customerName', coalesce(c.name, ''),
    'businessName', coalesce(b.name, 'ركين'),
    'systemType', b.loyalty_system_type,
    'points', c.loyalty_points,
    'visits', c.loyalty_visits,
    'units', c.loyalty_units,
    'freeRewards', c.loyalty_free_rewards,
    'visitsThreshold', b.loyalty_visits_threshold,
    'unitsThreshold', b.loyalty_unit_threshold,
    'rewardLabel', coalesce(b.loyalty_reward_label, 'مكافأة مجانية'),
    'accentColor', coalesce(b.loyalty_accent_color, '#C4FF2B'),
    'tagline', coalesce(b.loyalty_tagline, ''),
    'logoUrl', coalesce(b.loyalty_logo_url, b.logo_url, ''),
    'updatedAt', c.wallet_pass_updated_at,
    'enabled', coalesce(b.loyalty_enabled, true)
  ) into v_out
  from customers c
  join businesses b on b.id = c.business_id
  where c.public_token = p_token;

  return v_out;  -- null حين لا يطابق الرمز أحداً، ويردّها المسار 404.
end;
$wallet$;

revoke all on function get_wallet_pass_data(uuid) from public, anon;


-- ============ (7/7) 20260906040000_display_pairing_and_add_tokens ============

-- شاشة العميل: جهازٌ مقترن، ورمزٌ يُصرف مرة.
--
-- شاشة المنيو تعرض للعميل باركوداً يضيف به بطاقة ولائه. وفيها خطران
-- مختلفان لا يعالجهما شيء واحد:
--
--   1. الزبون التالي في الطابور يمسح باركود الذي قبله. وهذا لا يعالجه
--      وقتٌ قصير -- الطابور أسرع من أي مهلة -- بل يعالجه أن يُصرف
--      الرمز مرة واحدة: أول مسح يقتله، فما بعده لا يجد شيئاً.
--
--   2. جهازٌ آخر فتح الصفحة نفسها. والصفحة قناةٌ حيّة: من ملك رابطها
--      انضمّ إليها ورأى كل باركود يمرّ فيها، لا باركوداً واحداً. وهذا
--      لا يعالجه أن يُصرف الرمز مرة، بل أن تُقفل القناة على جهاز
--      بعينه -- فلا يصل إلى غيره أصلاً.
--
-- فالأول رمزٌ يُستهلك، والثاني جهازٌ يُقترن. وكلاهما هنا.

-- ============ الجهاز المقترن ============
--
-- شاشةٌ واحدة لكل فرع: هي التي أمام العميل. والاقتران برمزٍ يُنشئه
-- المالك من لوحة التحكم ويُدخله في الشاشة مرة، فتحفظه وتُعرَف به.
create table if not exists display_devices (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  branch_id bigint references branches(id) on delete cascade,
  /** ما تحفظه الشاشة وتُرسله مع كل استماع. سرٌّ لا معرّف. */
  device_secret text not null,
  label text not null default 'شاشة العميل',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists display_devices_secret on display_devices(device_secret);
create index if not exists display_devices_business on display_devices(business_id, branch_id);

alter table display_devices enable row level security;

drop policy if exists display_devices_read on display_devices;
create policy display_devices_read on display_devices
  for select using (business_id = current_business_id());

drop policy if exists display_devices_write on display_devices;
create policy display_devices_write on display_devices
  for all using (business_id = current_business_id() and has_permission('settings:edit'))
  with check (business_id = current_business_id() and has_permission('settings:edit'));

-- ============ نصّ الدعوة على الشاشة ============
--
-- يكتبه صاحب المطعم بلسانه: "بالعافية عليك" ليست عبارةً واحدة تصلح
-- لمقهى ومطعم ومخبز، ولا هي بلهجة كل مدينة.
alter table businesses
  add column if not exists display_barcode_message text
  not null default 'بالعافية عليك — امسح الباركود وصير من خلّاننا';

comment on column businesses.display_barcode_message is
  'النص المعروض فوق باركود الولاء على شاشة العميل.';

-- ============ رمز الإضافة: يُصرف مرة ============
--
-- ليس public_token: ذاك دائم، ومن صوّره ملك البطاقة إلى الأبد. وهذا
-- يُنشأ للحظته، ويموت عند أول استعمال أو بانقضاء مهلته -- أيّهما أسبق.
create table if not exists wallet_add_tokens (
  token uuid primary key default gen_random_uuid(),
  customer_id bigint not null references customers(id) on delete cascade,
  business_id bigint not null references businesses(id) on delete cascade,
  /** الشاشة التي عُرض عليها. رمزٌ عُرض على شاشةٍ لا يُصرف من غيرها. */
  display_device_id bigint references display_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists wallet_add_tokens_customer on wallet_add_tokens(customer_id);
create index if not exists wallet_add_tokens_expiry on wallet_add_tokens(expires_at);

alter table wallet_add_tokens enable row level security;
-- لا سياسة قراءة: لا يُقرأ إلا بمفتاح الخدمة من مسار الإضافة. ومن قرأ
-- الرمز ملك البطاقة، فلا يُعرض لأحد -- ولا للكاشير نفسه.

/**
 * ينشئ رمز إضافة للعرض على الشاشة.
 *
 * دقيقتان لا خمس عشرة ثانية: الأمان من أنه يُصرف مرة، لا من قصره.
 * وخمس عشرة ثانية تُربك العميل وهو يخرج جواله، ولا تمنع من صوّر
 * الشاشة -- التصوير أسرع منها على كل حال.
 */
create or replace function create_wallet_add_token(
  p_customer_id bigint,
  p_display_device_id bigint default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $mk$
declare
  v_business_id bigint;
  v_token uuid;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('pos:register') then
    return null;
  end if;
  if not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    return null;
  end if;

  -- رموز هذا الزبون السابقة تموت: العميل يطلبها ثانيةً لأن الأولى لم
  -- تنفع، فبقاؤها حيّةً يترك على الشاشة ما لم يعد يُقصد.
  update wallet_add_tokens
  set consumed_at = now()
  where customer_id = p_customer_id and consumed_at is null and expires_at > now();

  insert into wallet_add_tokens (customer_id, business_id, display_device_id, expires_at)
  values (p_customer_id, v_business_id, p_display_device_id, now() + interval '2 minutes')
  returning token into v_token;

  return v_token;
end;
$mk$;

revoke all on function create_wallet_add_token(bigint, bigint) from public, anon;
grant execute on function create_wallet_add_token(bigint, bigint) to authenticated;

/**
 * يصرف الرمز ويردّ رمز الزبون الدائم.
 *
 * والصرف والفحص في جملةٍ واحدة: لو قُرئ ثم كُتب، لمرّ بينهما مسحٌ ثانٍ
 * -- وهو بالضبط ما يقع حين يمسح اثنان الشاشة في اللحظة نفسها.
 */
create or replace function consume_wallet_add_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $use$
declare
  v_public uuid;
  v_display bigint;
begin
  update wallet_add_tokens t
  set consumed_at = now()
  from customers c
  where t.token = p_token
    and t.customer_id = c.id
    and t.consumed_at is null
    and t.expires_at > now()
  returning c.public_token, t.display_device_id into v_public, v_display;

  if v_public is null then
    return null;  -- مصروف، أو منتهٍ، أو لا وجود له.
  end if;

  -- ورقم الشاشة معه: الخادم يخبرها فتُخفي الباركود في اللحظة، فلا
  -- يقعد على وجهها يحجب المنيو عن الزبون التالي لدقيقتين وقد أُخذ.
  return jsonb_build_object('publicToken', v_public, 'displayDeviceId', v_display);
end;
$use$;

revoke all on function consume_wallet_add_token(uuid) from public, anon;

commit;
