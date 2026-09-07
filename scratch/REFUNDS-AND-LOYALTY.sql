-- الاسترجاع سطراً سطراً -- بناءً على ما هو قائم، لا بجانبه.
--
-- الموجود (20260905180000) يسترجع **مبلغاً**: يجمعه في
-- orders.refunded_amount، ويربطه بوردية الاسترجاع، ويعيد المخزون في
-- الاسترجاع الكامل وحده -- لأن مبلغاً جزئياً لا يقول أي صنفٍ رجع.
--
-- والناقص هو الصنف. فمن رجّع كوباً من ثلاثة لا سبيل له إلا أن يسترجع
-- الفاتورة كلّها -- فيعود إلى الرفّ ما لم يعُد، ويخسر المطعم مخزوناً
-- على الورق.
--
-- فتُضاف طبقةُ التفصيل: صفٌّ لكل استرجاع، وأسطرٌ تحته تقول أي صنفٍ
-- وكم. والمخزون يعود **للمختار وحده**. وorders.refunded_amount يبقى
-- هو المجموع كما كان -- فتسويةُ الوردية وكلُّ ما يقرؤه اليوم لا
-- يتغيّر، وإنما يصير له تفصيلٌ لم يكن.
--
-- ولا يُمسّ قيدُ الحالات: هو يشمل partially_refunded أصلاً، وإعادةُ
-- كتابته تُسقط 'pending' و'rejected' و'awaiting_payment' -- وفي
-- الجدول صفوفٌ تحملها.

create table if not exists order_refunds (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  order_id bigint not null references orders(id) on delete cascade,
  shift_id bigint references shifts(id),
  refunded_by uuid default auth.uid(),
  amount numeric not null check (amount >= 0),
  /** كامل الفاتورة، أو أسطرٌ منها، أو مبلغٌ يحدّده الكاشير. */
  kind text not null check (kind in ('full','lines','amount')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists order_refunds_order_idx on order_refunds(order_id);
create index if not exists order_refunds_shift_idx on order_refunds(shift_id);

create table if not exists order_refund_items (
  id bigint generated always as identity primary key,
  refund_id bigint not null references order_refunds(id) on delete cascade,
  order_item_id bigint not null references order_items(id),
  menu_item_id bigint references menu_items(id),
  qty numeric not null check (qty > 0),
  amount numeric not null check (amount >= 0)
);
create index if not exists order_refund_items_refund_idx on order_refund_items(refund_id);

alter table order_refunds enable row level security;
alter table order_refund_items enable row level security;

drop policy if exists order_refunds_select on order_refunds;
create policy order_refunds_select on order_refunds for select
  using (business_id = current_business_id());
drop policy if exists order_refund_items_select on order_refund_items;
create policy order_refund_items_select on order_refund_items for select
  using (exists (select 1 from order_refunds r
                 where r.id = refund_id and r.business_id = current_business_id()));

-- كم استُرجع من كل سطرٍ حتى الآن -- فلا يُرجَّع سطرٌ مرّتين.
create or replace function order_item_refunded_qty(p_order_item_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(ri.qty), 0)
  from order_refund_items ri
  where ri.order_item_id = p_order_item_id;
$$;
revoke all on function order_item_refunded_qty(bigint) from public, anon;
grant execute on function order_item_refunded_qty(bigint) to authenticated;

/**
 * ما يقرؤه الكاشير قبل أن يقرّر.
 *
 * أسطرُ الفاتورة، وكم بقي من كلٍّ منها غير مسترجَع، وكم بقي من مبلغها.
 * ولا يُحسب في المتصفّح: هو يعرض ما يقوله الخادم، فلا يفترقان في لحظةٍ
 * يُرجَّع فيها من جهازين.
 */
create or replace function get_order_refund_state(p_order_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $st$
declare
  v_business_id bigint;
  v_order record;
  v_lines jsonb;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not (has_permission('pos:register') or has_permission('screen:orders')) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_order from orders where id = p_order_id and business_id = v_business_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderItemId', oi.id,
    'menuItemId', oi.menu_item_id,
    'name', coalesce(mi.name, 'صنف'),
    'qty', oi.qty,
    'refundedQty', order_item_refunded_qty(oi.id),
    'unitPrice', oi.unit_price,
    'lineTotal', oi.line_total,
    'isFreeReward', coalesce(oi.is_free_reward, false),
    'isPointsRedemption', coalesce(oi.is_points_redemption, false)
  ) order by oi.id), '[]'::jsonb)
  into v_lines
  from order_items oi
  left join menu_items mi on mi.id = oi.menu_item_id
  where oi.order_id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'orderId', v_order.id,
    'status', v_order.status,
    'total', v_order.total,
    'discountPct', coalesce(v_order.discount_pct, 0),
    'refunded', coalesce(v_order.refunded_amount, 0),
    'refundable', greatest(v_order.total - coalesce(v_order.refunded_amount, 0), 0),
    'paymentMethod', v_order.payment_method,
    'lines', v_lines
  );
end;
$st$;
revoke all on function get_order_refund_state(bigint) from public, anon;
grant execute on function get_order_refund_state(bigint) to authenticated;

/**
 * استرجاع أسطرٍ بعينها -- والمخزون يعود لها وحدها.
 *
 * p_lines: [{orderItemId, qty}]
 *
 * والمبلغُ يُحسب من أسعار الأسطر لا يُؤخذ من المتصفّح: من يستطيع نداء
 * الدالّة يستطيع تمرير أي رقم، فالسعر يُقرأ من الفاتورة نفسها.
 *
 * والخصمُ يُوزَّع بنسبته: من اشترى بخصم ٢٠٪ لا يُردّ إليه السعر
 * كاملاً، إنما ما دفعه فعلاً.
 *
 * وorders.refunded_amount يُحدَّث كما يفعل refund_pos_order تماماً --
 * فتسويةُ الوردية وتقاريرُ اليوم تقرأ الاثنين بلا أن تعرف الفرق.
 */
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

    -- المكافأةُ المجانية تعود للمخزون ولا تعود بمال: ثمنها صفر أصلاً.
    insert into order_refund_items (refund_id, order_item_id, menu_item_id, qty, amount)
    values (v_refund_id, v_item.id, v_item.menu_item_id, v_take,
            round(coalesce(v_item.unit_price, 0) * v_take, 2));
    v_gross := v_gross + round(coalesce(v_item.unit_price, 0) * v_take, 2);
    v_count := v_count + 1;

    if v_item.menu_item_id is not null then
      for v_dec in select * from resolve_menu_item_recipe_decrements(v_item.menu_item_id, v_take) loop
        update stock_items set qty_on_hand = qty_on_hand + v_dec.qty, updated_at = now()
        where id = v_dec.stock_item_id and business_id = v_business_id;
      end loop;
      for v_dec in select * from resolve_finished_good_decrement(v_item.menu_item_id, v_take) loop
        update stock_items set qty_on_hand = qty_on_hand + v_dec.qty, updated_at = now()
        where id = v_dec.stock_item_id and business_id = v_business_id;
      end loop;
    end if;
  end loop;

  if v_count = 0 then
    delete from order_refunds where id = v_refund_id;
    return jsonb_build_object('ok', false, 'error', 'nothing_left_to_refund');
  end if;

  v_amount := round(v_gross * (1 - coalesce(v_order.discount_pct, 0) / 100.0), 2);
  -- ولا يتجاوز ما بقي: كسورُ التقريب لا تُخرج المجموع عن الإجمالي.
  v_amount := least(v_amount, v_order.total - coalesce(v_order.refunded_amount, 0));
  if v_amount < 0 then v_amount := 0; end if;
  update order_refunds set amount = v_amount where id = v_refund_id;

  v_new_total := coalesce(v_order.refunded_amount, 0) + v_amount;
  v_full := v_new_total >= v_order.total - 0.001;

  /**
   * وولاءُ ما رُجّع يُسحب معه.
   *
   * من اشترى ستّة أكواب فنال مكافأةً، ثم ردّها، يخرج بمكافأةٍ لم يشترِ
   * لها. وتُسحب الوحدات المعدودة وحدها -- لا كلُّ ما في الفاتورة:
   * المكافأةُ المجانية لم تُعدّ حين بيعت، فلا تُطرح حين تُردّ.
   */
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

/**
 * والاسترجاع بمبلغ يُسجَّل في الطبقة الجديدة كذلك.
 *
 * refund_pos_order يكتب المجموع في orders ولا يترك أثراً مفصَّلاً --
 * فتقريرُ "ما استُرجع اليوم" يرى مبلغاً بلا سبب. فيُلَفّ بحيث يكتب
 * صفَّه في order_refunds أيضاً: نفس المنطق، ومعه أثرُه.
 */
create or replace function refund_pos_order_amount(
  p_order_id bigint,
  p_amount numeric default null,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $ra$
declare
  v_business_id bigint;
  v_before numeric;
  v_res jsonb;
  v_shift_id bigint;
begin
  v_business_id := current_business_id();
  if v_business_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select coalesce(refunded_amount, 0) into v_before from orders
  where id = p_order_id and business_id = v_business_id;
  if v_before is null then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  v_res := refund_pos_order(p_order_id, p_amount);

  select id into v_shift_id from shifts
  where business_id = v_business_id and closed_at is null
  order by opened_at desc limit 1;

  insert into order_refunds (business_id, order_id, shift_id, amount, kind, reason)
  select v_business_id, p_order_id, v_shift_id,
         coalesce(o.refunded_amount, 0) - v_before,
         case when o.status = 'refunded' and v_before = 0 then 'full' else 'amount' end,
         nullif(btrim(coalesce(p_reason, '')), '')
  from orders o where o.id = p_order_id
    and coalesce(o.refunded_amount, 0) - v_before > 0;

  return v_res;
end;
$ra$;
revoke all on function refund_pos_order_amount(bigint, numeric, text) from public, anon;
grant execute on function refund_pos_order_amount(bigint, numeric, text) to authenticated;

-- ما استُرجع في وردية -- لتسويتها ولتقرير اليوم.
create or replace function shift_refunds_total(p_shift_id bigint)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)
  from order_refunds
  where shift_id = p_shift_id and business_id = current_business_id();
$$;
revoke all on function shift_refunds_total(bigint) from public, anon;
grant execute on function shift_refunds_total(bigint) to authenticated;
-- (١) الكوبُ المجاني لا يُعدّ نحو الكوب التالي.
--
-- تعليقُ الدالّة يقول ذلك صراحةً -- "كوبٌ خرج مكافأةً لا يقرّب صاحبه
-- من التالية، وإلا موّل العرضُ نفسه بلا نهاية" -- والشرطُ يستثني
-- is_points_redemption وحده. وكان يعمل بالمصادفة: الكاشير كان يعلّم
-- سطر المكافأة بالعلامتين معاً.
--
-- ثم صار للمكافأة عمودُها (is_free_reward)، ولم تعد تُعلَّم استبدالَ
-- نقاط -- فصار الكوب المجاني يُحتسب، ويولّد مكافأةً تولّد أخرى. عرضٌ
-- يموّل نفسه، ولا شيء يوقفه.
--
-- والدالّة تُعاد كما هي إلا سطرَ الشرط.
-- والترتيب كما هو في الأصل: المنشأة أولاً ثم العميل.
--
-- كتبتُهما معكوسين، فردّت القاعدة "cannot change name of input parameter"
-- ورفضت -- وهو رفضٌ في محلّه: لو قُبل لانقلبت المنشأةُ بالعميل في كل
-- احتساب، ولاحتُسب ولاءُ زبونٍ على منشأةٍ ليست منشأته.
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
    if p_total < coalesce(v_biz.loyalty_visit_min_total, 0) then return; end if;

    update customers set loyalty_visits = loyalty_visits + 1
      where id = p_customer_id and business_id = p_business_id
      returning loyalty_visits into v_visits_after;

    if v_visits_after >= v_biz.loyalty_visits_threshold then
      update customers set
        loyalty_visits = loyalty_visits - v_biz.loyalty_visits_threshold,
        loyalty_free_rewards = loyalty_free_rewards + 1
      where id = p_customer_id and business_id = p_business_id;
    end if;

  elsif v_biz.loyalty_system_type = 'products' then
    if p_order_id is null then return; end if;

    select coalesce(sum(oi.qty), 0) into v_units
    from order_items oi
    join menu_items mi on mi.id = oi.menu_item_id
    where oi.order_id = p_order_id
      and coalesce(oi.is_points_redemption, false) = false
      -- والمكافأةُ المجانية كذلك: هذا هو السطر الذي كان ناقصاً.
      and coalesce(oi.is_free_reward, false) = false
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

-- (٢) وما يُسترجَع يُسحب ولاؤه معه.
--
-- كان الاسترجاع يعيد المال والمخزون ولا يمسّ الرصيد: من اشترى ستّة
-- أكواب فنال مكافأةً، ثم ردّها كلَّها، يخرج بمكافأةٍ لم يشترِ لها.
-- وهي ثغرةٌ تُستغلّ بلا مهارة: اشترِ، خُذ، أرجع.
--
-- والسحب بقدر ما رُجّع لا أكثر، ولا ينزل الرصيد تحت الصفر: من صرف
-- مكافأته قبل أن يُرجع لا يُطالَب بها -- تلك بضاعةٌ خرجت، والمطعم
-- خسرها بقراره أن يقبل الردّ.
create or replace function claw_back_loyalty_for_refund(
  p_customer_id bigint,
  p_business_id bigint,
  p_units numeric default 0,
  p_visits int default 0,
  p_amount numeric default 0
) returns void
language plpgsql
security definer
set search_path = public
as $claw$
declare
  v_biz record;
  v_points int;
begin
  if p_customer_id is null then return; end if;
  select * into v_biz from businesses where id = p_business_id;
  if not found then return; end if;

  if v_biz.loyalty_system_type = 'products' and p_units > 0 then
    update customers set loyalty_units = greatest(0, loyalty_units - p_units::int)
    where id = p_customer_id and business_id = p_business_id;
  elsif v_biz.loyalty_system_type = 'visits' and p_visits > 0 then
    update customers set loyalty_visits = greatest(0, loyalty_visits - p_visits)
    where id = p_customer_id and business_id = p_business_id;
  elsif v_biz.loyalty_system_type = 'points'
        and coalesce(v_biz.loyalty_points_divisor, 0) > 0 and p_amount > 0 then
    v_points := floor(p_amount / v_biz.loyalty_points_divisor);
    if v_points > 0 then
      update customers set loyalty_points = greatest(0, loyalty_points - v_points)
      where id = p_customer_id and business_id = p_business_id;
    end if;
  end if;
end;
$claw$;
revoke all on function claw_back_loyalty_for_refund(bigint, bigint, numeric, int, numeric) from public, anon;
