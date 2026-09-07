-- تأكيد المكافأة برمزٍ يصل بطاقة العميل.
--
-- الصرف اليوم يشترط طلباً مؤكَّداً، والتأكيد يقع في صفحة بطاقة الويب
-- القديمة -- صفحةٌ لا يفتحها أحد. فالبوابة قائمة والباب مسدود، فيمرّ
-- الصرف عملياً بلا تأكيد: من عرف رقم جوال غيره أخذ مكافأته.
--
-- وكان عندنا رمزٌ يُدفع إلى الجهاز، فحُذف (20260808070000) لأن الدفع
-- إلى المحفظة لم يكن يعمل. وقد صار يعمل، فيعود الرمز -- وهذه المرّة
-- إلى البطاقة نفسها لا إلى إشعارات المتصفّح.
--
-- ولا تُلمس redeem_free_reward: الرمز طريقٌ ثانٍ إلى نفس الحالة
-- 'confirmed'، فما بعدها يبقى كما هو.
alter table loyalty_redemption_requests
  add column if not exists code text,
  add column if not exists attempts int not null default 0;

/**
 * يُنشأ الطلب برمزه.
 *
 * والرمز لا يُردّ إلى الكاشير أبداً -- هو يُكتب في بطاقة العميل وحدها.
 * ولو رُدّ لصار الكاشير قادراً على تأكيد نفسه، وسقطت الفائدة كلها.
 *
 * وأربعة أرقام تكفي: صلاحيته دقيقتان، ومحاولاته خمس -- فالتخمين
 * الأعمى دون واحدٍ من عشرة آلاف في نافذةٍ لا تُعاد.
 */
create or replace function create_loyalty_redemption_code(p_customer_id bigint, p_business_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $mk$
declare
  v_business_id bigint := p_business_id;
  v_code text;
  v_id bigint;
begin
  -- المنشأة تصل معطاةً لا مقروءةً من الجلسة: هذه الدالّة لا يناديها
  -- متصفّح أبداً -- يناديها الخادم بمفتاح الخدمة بعد أن يكون قد تحقّق
  -- من الكاشير ومن أن العميل عميلُه.
  --
  -- ولو فُتحت للكاشير ليقرأ current_business_id() لقدر أن يناديها من
  -- متصفّحه ويقرأ الرمز بنفسه -- وسقط كلُّ ما بُنيت لأجله.
  if v_business_id is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;

  -- وما سبق يُبطَل: رمزان حيّان لزبونٍ واحد يعني أن الأقدم يُقبل بعد
  -- أن ظنّ الكاشير أنه انتهى.
  update loyalty_redemption_requests
  set status = 'expired'
  where customer_id = p_customer_id and status = 'pending';

  v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
  insert into loyalty_redemption_requests (customer_id, business_id, status, expires_at, code)
  values (p_customer_id, v_business_id, 'pending', now() + interval '2 minutes', v_code)
  returning id into v_id;

  -- الرمز يخرج هنا إلى الخادم وحده ليكتبه في البطاقة، ولا يصل المتصفّح.
  return jsonb_build_object('ok', true, 'requestId', v_id, 'code', v_code);
end;
$mk$;
drop function if exists create_loyalty_redemption_code(bigint);
revoke all on function create_loyalty_redemption_code(bigint, bigint) from public, anon, authenticated;

/**
 * ويُتحقَّق منه بالمقارنة والاستهلاك في جملةٍ واحدة.
 *
 * فلا تقع بين الفحص والتأكيد لحظةٌ يمرّ فيها تحقّقٌ ثانٍ بالرمز نفسه.
 * والمحاولات تُعدّ قبل المقارنة: من أخطأ خمساً أُغلق عليه الطلب، ولو
 * أصاب السادسة.
 */
create or replace function verify_loyalty_redemption_code(p_request_id bigint, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $vf$
declare
  v_business_id bigint;
  v_ok boolean;
  v_left int;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('pos:register') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  update loyalty_redemption_requests
  set attempts = attempts + 1
  where id = p_request_id and business_id = v_business_id
    and status = 'pending' and expires_at > now() and attempts < 5
  returning (5 - attempts) into v_left;

  if v_left is null then
    return jsonb_build_object('ok', false, 'error', 'expired_or_locked');
  end if;

  update loyalty_redemption_requests
  set status = 'confirmed', responded_at = now()
  where id = p_request_id and business_id = v_business_id
    and status = 'pending' and code = btrim(p_code)
  returning true into v_ok;

  if v_ok is null then
    return jsonb_build_object('ok', false, 'error', 'wrong_code', 'triesLeft', v_left);
  end if;
  return jsonb_build_object('ok', true, 'requestId', p_request_id);
end;
$vf$;
revoke all on function verify_loyalty_redemption_code(bigint, text) from public, anon;
grant execute on function verify_loyalty_redemption_code(bigint, text) to authenticated;
