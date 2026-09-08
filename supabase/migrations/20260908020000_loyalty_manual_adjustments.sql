-- تعديلٌ يدويّ لرصيد الولاء، بسجلٍّ لا يُمحى.
--
-- كان رصيد العميل يتحرّك في اتجاهٍ واحد فقط: يزيد بالشراء، وينقص
-- بالصرف. فإذا مسح الكاشير الباركود مرّتين بالغلط، أو نسي يسجّل كوباً
-- استحقّه عميلٌ حقيقي، أو أراد صاحبُ المطعم يعتذر بكوبٍ مجاني -- ما
-- كان له طريق. والحلّ ليس عمودَ رصيدٍ يُكتب عليه مباشرة (عندها لا
-- يُعرف من غيّره ولا لماذا، ورقمٌ يتغيّر بلا أثرٍ يُشكّ فيه لا يُصدَّق)
-- بل معاملةٌ واحدة تُسجَّل وتُنفَّذ معاً: من غيّره، ومتى، وبكم، ولماذا.
--
-- وجدولُ customers نفسُه لا سياسة UPDATE عليه للعميل العاديّ -- كل
-- تغييرٍ في رصيد الولاء يمرّ من دالّةٍ بصلاحية معرّفها (SECURITY
-- DEFINER)، وهذه تبقى كذلك: لا INSERT مباشر على سجلّ التعديلات، فلا
-- يستطيع أحدٌ أن يكتب سطراً في السجلّ دون أن يقع التعديلُ فعلاً، ولا
-- أن يُعدَّل الرصيدُ دون أن يُسجَّل.

create table if not exists loyalty_adjustments (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id),
  customer_id bigint not null references customers(id),
  -- أيُّ رصيدٍ عُدِّل. لكلٍّ عمودُه على customers ومنطقُه:
  --   point         loyalty_points      رصيدٌ مباشر، بلا عتبة.
  --   visit / unit  loyalty_visits/units تعبُر عتبتها فتتحوّل مكافأة،
  --                                      كما تفعل زيارةٌ حقيقية بالضبط.
  --   free_reward   loyalty_free_rewards المكافآتُ الجاهزة نفسُها --
  --                                      اعتذارٌ بكوب، أو تصحيحُ عدٍّ.
  kind text not null check (kind in ('point','visit','unit','free_reward')),
  -- موجبٌ يزيد، وسالبٌ ينقص. لا صفر: تعديلٌ لا يُغيّر شيئاً ليس تعديلاً.
  delta int not null check (delta <> 0),
  -- الرصيدُ بعد هذا التعديل بالضبط -- لا يُحسب من السجلّ لاحقاً، بل
  -- يُحفظ لحظة وقوعه. فتاريخٌ يُقرأ بعد تعديلاتٍ كثيرة يبقى صحيحاً
  -- حتى لو تغيّرت طريقة الحساب يوماً.
  balance_after int not null,
  -- مكافآتٌ مُنحت نتيجة عبور العتبة في تعديل visit/unit موجب. صفرٌ في
  -- كل تعديلٍ آخر. تُقرأ من السجلّ فيُعرف: هل هذا التصحيح وحده، أم
  -- أوصل العميل مكافأةً كاملة؟
  rewards_granted int not null default 0 check (rewards_granted >= 0),
  -- إلزاميٌّ دائماً. تعديلٌ بلا سببٍ مكتوب مجرّد رقمٍ تغيّر، ولا يُصدَّق
  -- رصيدٌ لا يُعرف لماذا تغيّر.
  reason text not null check (length(btrim(reason)) > 0),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists loyalty_adjustments_customer_id_idx
  on loyalty_adjustments (customer_id, created_at desc);

alter table loyalty_adjustments enable row level security;

-- القراءة: من يرى شاشة الولاء، أو من يملك صلاحية التعديل نفسها --
-- فمن يقدر أن يُعدِّل يقدر أن يرى ماذا عُدِّل قبله.
drop policy if exists loyalty_adjustments_select on loyalty_adjustments;
create policy loyalty_adjustments_select on loyalty_adjustments for select
  using (
    business_id = current_business_id()
    and (has_permission('screen:loyalty') or has_permission('settings:edit'))
  );

comment on table loyalty_adjustments is
  'تعديلٌ يدويٌّ على رصيد ولاء عميل -- نقاط أو زيارات أو وحدات أو مكافآت جاهزة. سجلٌّ فقط، لا يُكتب فيه مباشرة؛ كل صفٍّ ينتج عن adjust_loyalty_balance().';

-- الدالّة الوحيدة التي تكتب في الجدول أعلاه، وتُعدِّل رصيد العميل معاً
-- في معاملةٍ واحدة: يقع الاثنان أو لا يقع شيء.
create or replace function adjust_loyalty_balance(
  p_customer_id bigint,
  p_kind text,
  p_delta int,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $adjust$
declare
  v_business_id bigint;
  v_biz record;
  v_cust record;
  v_reason text;
  v_current int;
  v_new int;
  v_rewards_granted int := 0;
  v_free_rewards_after int;
begin
  v_business_id := current_business_id();
  if v_business_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_business');
  end if;
  -- صاحبُ المطعم والمدير يقدران دائماً؛ الموظفُ يحتاج صلاحيةً صريحة --
  -- نفسُ الحارس الذي يحمي إعدادات المطعم كلَّها، لا حارسٌ جديد له وحده.
  if not has_permission('settings:edit') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_kind not in ('point','visit','unit','free_reward') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('ok', false, 'error', 'zero_delta');
  end if;
  -- سقفٌ عاقل: تصحيحٌ حقيقي لا يتجاوز هذا، وخطأً إملائياً في الرقم
  -- (صفرٌ زائد) يُرفض هنا لا أن يُصرف رصيداً لا يُقصد.
  if abs(p_delta) > 50 then
    return jsonb_build_object('ok', false, 'error', 'delta_too_large');
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

  if p_kind = 'point' then
    v_current := round(v_cust.loyalty_points)::int;
    v_new := v_current + p_delta;
    if v_new < 0 then
      return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'current', v_current);
    end if;
    update customers set loyalty_points = v_new where id = p_customer_id;
    v_free_rewards_after := v_cust.loyalty_free_rewards;

  elsif p_kind = 'free_reward' then
    v_current := v_cust.loyalty_free_rewards;
    v_new := v_current + p_delta;
    if v_new < 0 then
      return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'current', v_current);
    end if;
    update customers set loyalty_free_rewards = v_new where id = p_customer_id;
    v_free_rewards_after := v_new;

  elsif p_kind = 'visit' then
    select * into v_biz from businesses where id = v_business_id;
    v_current := v_cust.loyalty_visits;
    v_new := v_current + p_delta;
    if v_new < 0 then
      return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'current', v_current);
    end if;
    -- عبورُ العتبة يمنح مكافأةً بالضبط كما تمنحها زيارةٌ حقيقية: يُطرح
    -- حدُّها وتُمنح مكافأة، وقد تُعبَر أكثرَ من مرّةٍ في تصحيحٍ واحد.
    if p_delta > 0 and v_biz.loyalty_visits_threshold > 0 then
      v_rewards_granted := v_new / v_biz.loyalty_visits_threshold;
      v_new := v_new % v_biz.loyalty_visits_threshold;
    end if;
    update customers set
      loyalty_visits = v_new,
      loyalty_free_rewards = loyalty_free_rewards + v_rewards_granted
      where id = p_customer_id
      returning loyalty_free_rewards into v_free_rewards_after;

  elsif p_kind = 'unit' then
    select * into v_biz from businesses where id = v_business_id;
    v_current := v_cust.loyalty_units;
    v_new := v_current + p_delta;
    if v_new < 0 then
      return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'current', v_current);
    end if;
    if p_delta > 0 and v_biz.loyalty_unit_threshold > 0 then
      v_rewards_granted := v_new / v_biz.loyalty_unit_threshold;
      v_new := v_new % v_biz.loyalty_unit_threshold;
    end if;
    update customers set
      loyalty_units = v_new,
      loyalty_free_rewards = loyalty_free_rewards + v_rewards_granted
      where id = p_customer_id
      returning loyalty_free_rewards into v_free_rewards_after;
  end if;

  insert into loyalty_adjustments
    (business_id, customer_id, kind, delta, balance_after, rewards_granted, reason, created_by)
  values
    (v_business_id, p_customer_id, p_kind, p_delta, v_new, v_rewards_granted, v_reason, auth.uid());

  return jsonb_build_object(
    'ok', true,
    'kind', p_kind,
    'balanceAfter', v_new,
    'freeRewardsAfter', v_free_rewards_after,
    'rewardsGranted', v_rewards_granted
  );
end;
$adjust$;

revoke all on function adjust_loyalty_balance(bigint, text, int, text) from public, anon;
grant execute on function adjust_loyalty_balance(bigint, text, int, text) to authenticated;

comment on function adjust_loyalty_balance is
  'تعديلٌ يدويّ لرصيد ولاء عميل واحد (نقاط/زيارات/وحدات/مكافآت)، بسببٍ إلزاميّ وسجلٍّ في loyalty_adjustments. عبور عتبة الزيارات/الوحدات يمنح مكافأة بنفس منطق الطلب الحقيقي.';
