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
