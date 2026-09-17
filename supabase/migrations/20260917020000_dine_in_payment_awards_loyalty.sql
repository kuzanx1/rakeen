-- طلبُ الطاولة يكسب ولاءً -- كان لا يكسب شيئًا في أي نظام.
--
-- ▓ العطل (سابقٌ لإصلاح 20260917000000 ومستقلٌّ عنه):
--   مسارُ الطاولات خطوتان: register_dine_in_order يسجّل الطلب، ثم
--   pay_dine_in_order يقبض. والأولى تصرِف نقاطًا ولا تمنح، والثانية لا
--   تمسّ الولاء إطلاقًا -- في أيٍّ من تعريفاتها الثلاث.
--
--   فمقهًى يعمل بنظام «اجلس ثم ادفع» لا يكسب عملاؤه زيارةً ولا نقطةً
--   ولا كوبًا منذ أن وُجد المسار. والكاشير يرى رصيدهم صفرًا ويظنّ
--   الولاء معطّلًا.
--
-- ▓ ولماذا عند الدفع لا عند التسجيل:
--   الطلب يُسجَّل ثم قد يُلغى قبل أن يُدفع -- فمنحُه عند التسجيل يعطي
--   زيارةً لمن لم يشترِ. والأهمّ أن claw_back_loyalty_for_refund تسحب
--   عند الاسترجاع، والاسترجاع لا يقع إلا على مدفوع: فلو مُنح عند
--   التسجيل لبقيت زياراتٌ لا يقابلها مالٌ ولا يسحبها شيء.
--
--   وv_total يُقرأ من الطلب نفسه لا من بارامتر، فالحدّ الأدنى للزيارة
--   (loyalty_visit_min_total) يُقاس على ما دُفع فعلًا لا على رقمٍ
--   أرسله العميل.
--
-- ▓ ولا ازدواج: complete_pos_order لا تمسّ طلبات الطاولات المؤجّلة،
--   وaward_loyalty_for_order لا تُنادى هنا إلا بعد أن يصير الطلب
--   مدفوعًا، ومرّةً واحدة (الشرط payment_status = 'unpaid' يمنع
--   استدعاءً ثانيًا لنفس الطلب).
--
-- لا يتغيّر التوقيع، فلا drop ولا إعادة revoke.

create or replace function pay_dine_in_order(
  p_order_id bigint,
  p_payment_method text,
  p_cash_amount numeric,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_id bigint default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $pdio$
declare
  v_business_id bigint := current_business_id();
  v_table_id bigint;
  v_customer_id bigint;
  v_total numeric;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from customers where id = p_customer_id and business_id = v_business_id
  ) then
    raise exception 'customer not found';
  end if;

  update orders set
    payment_status = 'paid',
    payment_method = p_payment_method,
    cash_amount = p_cash_amount,
    customer_name = coalesce(p_customer_name, customer_name),
    customer_phone = coalesce(p_customer_phone, customer_phone),
    customer_id = coalesce(customer_id, p_customer_id)
  where id = p_order_id and business_id = v_business_id and payment_status = 'unpaid'
  returning table_id, customer_id, total into v_table_id, v_customer_id, v_total;

  if not found then
    raise exception 'order not found or already paid';
  end if;

  if v_table_id is not null then
    update restaurant_tables set status = 'cleaning', active_order_id = null
      where id = v_table_id and business_id = v_business_id;
  end if;

  -- السطر الذي لم يوجد قطّ في هذا المسار. award_loyalty_for_order وحدها
  -- تعرف نوع النظام وعتبته وحدّه الأدنى، وأن سطر المكافأة المجانية لا
  -- يُحتسب -- فلا تُنسخ كتلةٌ هنا، كما نُسخت في complete_pos_order
  -- فسقطت ثلاث مرّات.
  perform award_loyalty_for_order(v_business_id, v_customer_id, v_total, p_order_id);

  return v_table_id;
end;
$pdio$;
