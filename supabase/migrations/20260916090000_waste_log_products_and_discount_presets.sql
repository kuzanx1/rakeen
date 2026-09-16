-- الهدر يصير مقروءًا، ويشمل المنتجات لا المواد وحدها. والخصم يصير له
-- اسمٌ يُعرف به في التقارير.
--
-- ▓ ما كان ناقصًا في الهدر:
--
--   ١· لا موضع يُقرأ منه. الهدر يُكتب في stock_movements فيظهر داخل
--      سجلّ الصنف الواحد -- فمن أراد أن يعرف «كم هدرنا الشهر؟» فتح
--      الأصناف واحدًا واحدًا. فلا تقرير، ولا سبب مجموع.
--
--   ٢· لا يقبل إلا مواد المخزون. وأكثر الهدر في المطاعم منتجٌ تامّ:
--      وجبة عامل، أو كوبٌ رُدّ، أو صنفٌ احترق. والباريستا لا يعرف أن
--      «وجبة الموظف» تعني ١٨٠غ دجاج و٥٠غ أرزّ -- يعرف أنها وجبة.
--
--   فأُضيف waste_log: سطرٌ لكل واقعة، بالمادة أو بالمنتج، وبكلفتها
--   محسوبةً لحظتها لا يوم القراءة (فسعر المادة يتغيّر، والتقرير
--   التاريخي يجب أن يبقى كما وقع). وrk_record_product_waste تخصم
--   المنتج بنفس مسارات البيع الأربعة -- وصفة، بوكس، صنف جاهز، وخيارات
--   مرتبطة بالمخزون -- فلا يفوتها مصدرٌ كما فات الاسترجاع من قبل.
--
-- ▓ وما كان ناقصًا في الخصم: اسمٌ له.
--
--   «خصم ٣٠٪» في تقريرٍ لا يقول إن كانت عروض اليوم الوطني أم ضيافةً
--   أم تسويةَ شكوى. فصار لصاحب المطعم أن يعرّف خصوماته بأسمائها،
--   وتظهر للكاشير أزرارًا جاهزة.
--
--   ولم يُضَف عمودٌ للمعرّف على orders عمدًا: السبب النصّي موجود أصلًا
--   ويمرّ في مسار الطلب كاملًا. فالقالب يملأه بعنوانه، وتتجمّع
--   الإحصاءات عليه. وهذا أصدق من مفتاحٍ أجنبي: لو أعاد المالك تسمية
--   القالب غدًا بقيت الطلبات القديمة تحمل الاسم الذي بِيعت به، لا
--   الاسم الجديد. ويوفّر تغييرَ توقيعِ دالّتي الطلب مرّةً ثالثة.

-- ══ ١) سجلّ الهدر ══════════════════════════════════════════
create table if not exists waste_log (
  id            bigint generated always as identity primary key,
  business_id   bigint not null references businesses(id) on delete cascade,
  -- أحدهما لا كلاهما: مادةُ مخزون، أو منتجٌ من القائمة.
  stock_item_id bigint references stock_items(id) on delete set null,
  menu_item_id  bigint references menu_items(id)  on delete set null,
  item_name     text not null,   -- يُحفظ نصًّا: الصنف قد يُحذف والتقرير يبقى
  qty           numeric not null check (qty > 0),
  unit          text,
  reason        text not null,
  cost          numeric not null default 0,  -- كلفتها لحظتها لا يوم القراءة
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  constraint waste_log_target_ck check (stock_item_id is not null or menu_item_id is not null)
);
create index if not exists waste_log_biz_idx  on waste_log(business_id, created_at desc);
create index if not exists waste_log_item_idx on waste_log(stock_item_id);
create index if not exists waste_log_menu_idx on waste_log(menu_item_id);

alter table waste_log enable row level security;
drop policy if exists waste_log_select on waste_log;
create policy waste_log_select on waste_log for select
  using (business_id = current_business_id()
         and (has_permission('screen:inventory') or has_permission('screen:reports')));
-- لا سياسة كتابة: يُكتب حصرًا عبر الدوال أدناه (security definer).

-- ══ ٢) هدر مادة -- يكتب في السجلّ أيضًا ═══════════════════
create or replace function rk_record_waste(
  p_stock_item_id bigint,
  p_qty           numeric,
  p_reason        text,
  p_unit          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $waste$
declare
  v_business_id bigint := current_business_id();
  v_item  record;
  v_qty   numeric;
  v_cost  numeric;
begin
  -- الكاشير يسجّل الهدر أيضًا: هو من يقع الكوب من يده، لا صاحب المطعم
  -- على مكتبه مساءً. فلو اشتُرط screen:inventory لما سُجّل هدرٌ قط.
  if v_business_id is null
     or not (has_permission('screen:inventory') or has_permission('pos:register')) then
    raise exception 'not authorized';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'الكمية لازم تكون أكبر من صفر';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'لازم تكتب سبب الهدر';
  end if;

  select * into v_item from stock_items
  where id = p_stock_item_id and business_id = v_business_id for update;
  if v_item is null then
    raise exception 'stock item not found';
  end if;

  v_qty := rka_to_base(p_qty, coalesce(nullif(btrim(p_unit), ''), v_item.unit),
                       v_item.unit, v_item.grams_per_unit);
  if v_qty is null or v_qty <= 0 then
    raise exception 'تعذّر تحويل الكمية إلى وحدة الصنف';
  end if;

  v_cost := round(v_qty * coalesce(v_item.unit_cost, 0), 2);

  perform rk_stock_move(v_business_id, p_stock_item_id, -v_qty,
    'waste', 'waste', null, null, btrim(p_reason));

  insert into waste_log (business_id, stock_item_id, item_name, qty, unit, reason, cost, created_by)
  values (v_business_id, p_stock_item_id, v_item.name, v_qty, v_item.unit, btrim(p_reason), v_cost, auth.uid());

  return jsonb_build_object(
    'ok', true,
    'qtyAfter', v_item.qty_on_hand - v_qty,
    'cost', v_cost
  );
end;
$waste$;

-- ══ ٣) هدر منتج تامّ ═══════════════════════════════════════
-- يخصم بنفس مسارات البيع الأربعة. والخيارات تُمرَّر كما يمرّرها البيع
-- (stock_decrements المحسوبة في العميل للخيارات المرتبطة بالمخزون)،
-- فإن لم تُمرَّر خُصمت الوصفة وحدها -- وهو الصواب حين يتخطّى المستخدم
-- الخيارات عمدًا، لا خطأٌ صامت.
create or replace function rk_record_product_waste(
  p_menu_item_id      bigint,
  p_qty               numeric,
  p_reason            text,
  p_stock_decrements  jsonb default '[]'::jsonb,
  p_box_selections    jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $pwaste$
declare
  v_business_id bigint := current_business_id();
  v_item    record;
  v_cost    numeric := 0;
  v_note    text;
  dec_row   record;
  dec       jsonb;
  v_si      record;
  v_lines   int := 0;
begin
  if v_business_id is null
     or not (has_permission('screen:inventory') or has_permission('pos:register')) then
    raise exception 'not authorized';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'الكمية لازم تكون أكبر من صفر';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'لازم تكتب سبب الهدر';
  end if;

  select * into v_item from menu_items
  where id = p_menu_item_id and business_id = v_business_id;
  if v_item is null then
    raise exception 'menu item not found';
  end if;

  v_note := btrim(p_reason) || ' — ' || v_item.name;

  for dec_row in select * from resolve_menu_item_recipe_decrements(p_menu_item_id, p_qty) loop
    select unit_cost into v_si from stock_items where id = dec_row.stock_item_id and business_id = v_business_id;
    v_cost := v_cost + coalesce(v_si.unit_cost, 0) * dec_row.qty;
    perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty,
      'waste', 'recipe', null, null, v_note);
    v_lines := v_lines + 1;
  end loop;

  for dec_row in select * from resolve_box_selection_decrements(p_menu_item_id, p_qty, p_box_selections) loop
    select unit_cost into v_si from stock_items where id = dec_row.stock_item_id and business_id = v_business_id;
    v_cost := v_cost + coalesce(v_si.unit_cost, 0) * dec_row.qty;
    perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty,
      'waste', 'box', null, null, v_note);
    v_lines := v_lines + 1;
  end loop;

  for dec_row in select * from resolve_finished_good_decrement(p_menu_item_id, p_qty) loop
    select unit_cost into v_si from stock_items where id = dec_row.stock_item_id and business_id = v_business_id;
    v_cost := v_cost + coalesce(v_si.unit_cost, 0) * dec_row.qty;
    perform rk_stock_move(v_business_id, dec_row.stock_item_id, -dec_row.qty,
      'waste', 'finished_good', null, null, v_note);
    v_lines := v_lines + 1;
  end loop;

  for dec in select * from jsonb_array_elements(coalesce(p_stock_decrements, '[]'::jsonb)) loop
    select unit_cost into v_si from stock_items
      where id = (dec->>'stock_item_id')::bigint and business_id = v_business_id;
    v_cost := v_cost + coalesce(v_si.unit_cost, 0) * (dec->>'qty')::numeric;
    perform rk_stock_move(v_business_id, (dec->>'stock_item_id')::bigint, -((dec->>'qty')::numeric),
      'waste', 'modifier', null, null, v_note);
    v_lines := v_lines + 1;
  end loop;

  v_cost := round(v_cost, 2);

  insert into waste_log (business_id, menu_item_id, item_name, qty, unit, reason, cost, note, created_by)
  values (v_business_id, p_menu_item_id, v_item.name, p_qty, 'piece', btrim(p_reason), v_cost,
          case when v_lines = 0 then 'المنتج ما له وصفة مربوطة — انسجّل الهدر بلا خصم من المخزون' end,
          auth.uid());

  return jsonb_build_object(
    'ok', true,
    'cost', v_cost,
    'stockLines', v_lines,
    -- صفرٌ هنا ليس خطأ: منتجٌ بلا وصفة يُسجَّل هدره ولا يُخصم منه شيء،
    -- ويُقال ذلك للكاشير بدل أن يظنّ أن المخزون نقص.
    'deductedFromStock', v_lines > 0
  );
end;
$pwaste$;

-- ══ ٤) قوالب الخصم ═════════════════════════════════════════
create table if not exists discount_presets (
  id          bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  name        text not null,
  name_en     text,
  pct         numeric not null check (pct > 0 and pct <= 100),
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists discount_presets_biz_idx on discount_presets(business_id, active, sort_order);

alter table discount_presets enable row level security;
drop policy if exists discount_presets_select on discount_presets;
create policy discount_presets_select on discount_presets for select
  using (business_id = current_business_id());
drop policy if exists discount_presets_write on discount_presets;
create policy discount_presets_write on discount_presets for all
  using (business_id = current_business_id() and has_permission('screen:settings'))
  with check (business_id = current_business_id() and has_permission('screen:settings'));

-- ══ ٥) طلبٌ غطّاه الخصم كاملًا ليس كاشًا بصفر ══════════════
-- ١٠٠٪ خصمٌ وارد (ضيافة، تعويض شكوى، وجبة موظف تُسجَّل طلبًا)، وكان
-- ممنوعًا في العميلين بسقف ٩٩. ولمّا فُتح ظهر سؤالٌ ثانٍ: بأي طريقة
-- دفعٍ يُسجَّل؟ تسجيله كاشًا يكتب في السجلّ «٠٫٠٠ كاش» فلا يُعرف من
-- أين جاء -- وهي نفس العلّة التي حُلّت لاستبدال النقاط بـ'loyalty'
-- في 20260907080000. فله وسمه: 'discount'.
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('cash', 'card', 'split', 'delivery_platform', 'loyalty', 'discount'));

-- ══ ٥) الصلاحيات ═══════════════════════════════════════════
revoke all    on function rk_record_waste(bigint, numeric, text, text)                     from public, anon;
revoke all    on function rk_record_product_waste(bigint, numeric, text, jsonb, jsonb)     from public, anon;
grant execute on function rk_record_waste(bigint, numeric, text, text)                     to authenticated;
grant execute on function rk_record_product_waste(bigint, numeric, text, jsonb, jsonb)     to authenticated;
