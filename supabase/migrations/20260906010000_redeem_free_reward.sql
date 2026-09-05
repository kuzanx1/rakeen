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
