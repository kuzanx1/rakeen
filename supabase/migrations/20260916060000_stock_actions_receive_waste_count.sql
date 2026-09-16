-- أفعال المخزون الثلاثة: استلام كمية، هدر، جرد — ومعها «أيام الكفاية».
--
-- كل تغيّر في الرصيد صار له بابٌ معلوم يكتب سطره في سجلّ الحركة
-- (20260916030000). ولم يبقَ بابٌ صامت.
--
-- ▓ لماذا الاستلام دالّة مستقلّة عن فاتورة الشراء؟
--   لأن التعبئة لا تنتظر الفاتورة دائمًا: يصل المورّد ظهرًا والفاتورة
--   تُسجَّل مساءً. وهذا تمييزٌ قائمٌ في أنظمة المخزون (استلام بضاعة /
--   مستند ماليّ). فمن أراد التسجيل السريع فله بابه، ومن أراد الفاتورة
--   الكاملة بالمورّد والضريبة فبابها باقٍ كما هو.
--
--   والتكلفة تُحسب بالمتوسط المرجّح -- وهو ما تفعله فاتورة الشراء أصلاً،
--   فلا يفترق البابان في نتيجتهما.
--
-- ▓ لماذا سبب الهدر إجباري؟
--   تسجيل الهدر اختياري، فمن سجّله فقد اختار. لكن هدرًا بلا سبب رقمٌ
--   لا يُقرأ منه شيء: لا يُعرف أهو تلفٌ يستدعي تغيير مورّد، أم انسكابٌ
--   يستدعي تدريبًا. فالفعل اختياري والتفسير إجباري.

-- ── ١) استلام كمية ──────────────────────────────────────────
-- p_total_cost = null  →  نفس تكلفة الوحدة السابقة (لا يتغيّر المتوسط)
-- p_unit       = null  →  الكمية بوحدة الصنف نفسها
create or replace function rk_receive_stock(
  p_stock_item_id bigint,
  p_qty           numeric,
  p_total_cost    numeric default null,
  p_unit          text    default null,
  p_note          text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $recv$
declare
  v_business_id bigint := current_business_id();
  v_item   record;
  v_qty    numeric;
  v_after  numeric;
  v_cost   numeric;
begin
  if v_business_id is null or not has_permission('screen:inventory') then
    raise exception 'not authorized';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'الكمية لازم تكون أكبر من صفر';
  end if;

  select * into v_item from stock_items
  where id = p_stock_item_id and business_id = v_business_id for update;
  if v_item is null then
    raise exception 'stock item not found';
  end if;

  -- الكمية إلى وحدة الصنف (٥ كيلو على صنفٍ يُتتبَّع بالغرام = ٥٠٠٠)
  v_qty := rka_to_base(p_qty, coalesce(nullif(btrim(p_unit), ''), v_item.unit),
                       v_item.unit, v_item.grams_per_unit);
  if v_qty is null or v_qty <= 0 then
    raise exception 'تعذّر تحويل الكمية إلى وحدة الصنف';
  end if;

  v_after := v_item.qty_on_hand + v_qty;

  -- المتوسط المرجّح. وبلا مبلغ، التكلفة كما هي -- «نفس السعر السابق».
  v_cost := case
    when p_total_cost is null or p_total_cost <= 0 then v_item.unit_cost
    when v_after > 0 then (v_item.qty_on_hand * v_item.unit_cost + p_total_cost) / v_after
    else v_item.unit_cost
  end;

  update stock_items set unit_cost = v_cost where id = p_stock_item_id;

  perform rk_stock_move(v_business_id, p_stock_item_id, v_qty,
    'purchase', 'receipt', null, null,
    coalesce(nullif(btrim(p_note), ''), 'استلام كمية'));

  return jsonb_build_object(
    'ok', true,
    'qtyAfter', v_after,
    'unitCost', round(v_cost, 6),
    'unitCostBefore', round(v_item.unit_cost, 6),
    'costChanged', p_total_cost is not null and p_total_cost > 0
  );
end;
$recv$;

-- ── ٢) هدر ─────────────────────────────────────────────────
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

  perform rk_stock_move(v_business_id, p_stock_item_id, -v_qty,
    'waste', 'waste', null, null, btrim(p_reason));

  return jsonb_build_object(
    'ok', true,
    'qtyAfter', v_item.qty_on_hand - v_qty,
    'cost', round(v_qty * v_item.unit_cost, 2)
  );
end;
$waste$;

-- ── ٣) جرد ─────────────────────────────────────────────────
-- الرقم المُدخل هو المعدود فعلاً، لا الفرق. فإعادة النداء بنفس الرقم
-- لا تكتب سطرًا ثانيًا.
create or replace function rk_stocktake(
  p_stock_item_id bigint,
  p_counted_qty   numeric,
  p_note          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $count$
declare
  v_business_id bigint := current_business_id();
  v_item  record;
  v_diff  numeric;
begin
  if v_business_id is null or not has_permission('screen:inventory') then
    raise exception 'not authorized';
  end if;
  if p_counted_qty is null or p_counted_qty < 0 then
    raise exception 'الكمية المعدودة لازم تكون صفرًا أو أكثر';
  end if;

  select * into v_item from stock_items
  where id = p_stock_item_id and business_id = v_business_id for update;
  if v_item is null then
    raise exception 'stock item not found';
  end if;

  v_diff := p_counted_qty - v_item.qty_on_hand;
  if abs(v_diff) < 0.0000001 then
    return jsonb_build_object('ok', true, 'diff', 0, 'qtyAfter', p_counted_qty);
  end if;

  -- فرقٌ كبير بلا تفسير هو ما تختبئ خلفه المشاكل.
  if v_item.qty_on_hand > 0
     and abs(v_diff) / v_item.qty_on_hand > 0.10
     and coalesce(btrim(p_note), '') = '' then
    raise exception 'الفرق كبير — اكتب ملاحظة تشرح سببه';
  end if;

  perform rk_stock_move(v_business_id, p_stock_item_id, v_diff,
    'count', 'count', null, null,
    coalesce(nullif(btrim(p_note), ''), 'جرد'));

  return jsonb_build_object(
    'ok', true,
    'diff', v_diff,
    'qtyBefore', v_item.qty_on_hand,
    'qtyAfter', p_counted_qty,
    'cost', round(abs(v_diff) * v_item.unit_cost, 2)
  );
end;
$count$;

-- ── ٤) أيام الكفاية ────────────────────────────────────────
-- الاستهلاك اليومي من السجلّ نفسه: ما خرج بيعًا واستهلاكًا تلقائيًا
-- خلال آخر ١٤ يومًا ÷ ١٤. ولا يُحسب الهدر ولا الجرد -- هما حدثان
-- عارضان لا معدّل استهلاك.
--
-- وصنفٌ لم يتحرك بعد يرجع null، لا صفرًا: «لا أعرف» ليست «لا يُستهلك».
create or replace function rk_stock_days_cover()
returns table (stock_item_id bigint, daily_usage numeric, days_left numeric)
language sql
security definer
stable
set search_path = public
as $cover$
  with usage as (
    select sm.stock_item_id, sum(-sm.delta) / 14.0 as per_day
    from stock_movements sm
    where sm.business_id = current_business_id()
      and sm.reason in ('sale', 'indirect')
      and sm.delta < 0
      and sm.created_at > now() - interval '14 days'
    group by sm.stock_item_id
  )
  select si.id,
         u.per_day,
         case when coalesce(u.per_day, 0) > 0
              then round(si.qty_on_hand / u.per_day, 1)
              else null end
  from stock_items si
  left join usage u on u.stock_item_id = si.id
  where si.business_id = current_business_id();
$cover$;

revoke all on function rk_receive_stock(bigint, numeric, numeric, text, text) from public, anon;
revoke all on function rk_record_waste(bigint, numeric, text, text)          from public, anon;
revoke all on function rk_stocktake(bigint, numeric, text)                   from public, anon;
revoke all on function rk_stock_days_cover()                                 from public, anon;
grant execute on function rk_receive_stock(bigint, numeric, numeric, text, text) to authenticated;
grant execute on function rk_record_waste(bigint, numeric, text, text)          to authenticated;
grant execute on function rk_stocktake(bigint, numeric, text)                   to authenticated;
grant execute on function rk_stock_days_cover()                                 to authenticated;
