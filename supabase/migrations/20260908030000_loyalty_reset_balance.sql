-- تصفير رصيد ولاء عضوٍ واحد، دفعةً واحدة.
--
-- كان التصحيح يمرّ رصيداً رصيداً عبر adjust_loyalty_balance -- مناسبٌ
-- لغلطة كاشيرٍ صغيرة، لكن لا لعضوٍ يُطلب منه صفحةٌ بيضاء (بطاقة ضاعت
-- واستُبدلت، أو عميلٌ طلب مسح رصيده). فبدل أربع ضغطاتٍ منفصلة على كل
-- عدّاد حتى يصل صفراً، تصفيرٌ واحدٌ يُنهي الأربعة معاً.
--
-- والسببُ إلزاميٌّ هنا أيضاً، وكلُّ رصيدٍ كان غير صفرٍ يُسجَّل سطراً
-- خاصّاً به في loyalty_adjustments بقيمته السالبة كاملةً -- فالسجلّ
-- يبقى صادقاً: "كان عنده ٣ أكواب و٢ مكافأة، صُفِّرا معاً وهذا سببه"،
-- لا سطرٌ غامضٌ يقول "تصفير" بلا رقمٍ يُقارَن.

create or replace function reset_loyalty_balance(
  p_customer_id bigint,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $reset$
declare
  v_business_id bigint;
  v_cust record;
  v_reason text;
begin
  v_business_id := current_business_id();
  if v_business_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_business');
  end if;
  -- نفسُ حارس adjust_loyalty_balance بالضبط: صاحبُ المطعم والمدير
  -- دائماً، والموظفُ يحتاج صلاحيةً صريحة.
  if not has_permission('settings:edit') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if length(v_reason) = 0 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select * into v_cust from customers
    where id = p_customer_id and business_id = v_business_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;

  if round(v_cust.loyalty_points)::int <> 0 then
    insert into loyalty_adjustments (business_id, customer_id, kind, delta, balance_after, reason, created_by)
    values (v_business_id, p_customer_id, 'point', -round(v_cust.loyalty_points)::int, 0, v_reason, auth.uid());
  end if;
  if v_cust.loyalty_visits <> 0 then
    insert into loyalty_adjustments (business_id, customer_id, kind, delta, balance_after, reason, created_by)
    values (v_business_id, p_customer_id, 'visit', -v_cust.loyalty_visits, 0, v_reason, auth.uid());
  end if;
  if v_cust.loyalty_units <> 0 then
    insert into loyalty_adjustments (business_id, customer_id, kind, delta, balance_after, reason, created_by)
    values (v_business_id, p_customer_id, 'unit', -v_cust.loyalty_units, 0, v_reason, auth.uid());
  end if;
  if v_cust.loyalty_free_rewards <> 0 then
    insert into loyalty_adjustments (business_id, customer_id, kind, delta, balance_after, reason, created_by)
    values (v_business_id, p_customer_id, 'free_reward', -v_cust.loyalty_free_rewards, 0, v_reason, auth.uid());
  end if;

  -- الرابعةُ معاً بتحديثٍ واحد -- لا أربع جولات ذهابٍ وإيابٍ للقاعدة.
  update customers set
    loyalty_points = 0,
    loyalty_visits = 0,
    loyalty_units = 0,
    loyalty_free_rewards = 0
    where id = p_customer_id;

  return jsonb_build_object('ok', true);
end;
$reset$;

revoke all on function reset_loyalty_balance(bigint, text) from public, anon;
grant execute on function reset_loyalty_balance(bigint, text) to authenticated;

comment on function reset_loyalty_balance is
  'يصفّر رصيد ولاء عضوٍ واحد بالكامل (نقاط/زيارات/وحدات/مكافآت جاهزة) دفعةً واحدة، بسببٍ إلزاميّ وسطرٍ في loyalty_adjustments لكل رصيدٍ كان غير صفر.';
