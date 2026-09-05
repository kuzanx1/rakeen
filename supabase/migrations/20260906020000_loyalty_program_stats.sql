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
