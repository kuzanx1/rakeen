-- اسمٌ إنجليزي لمواد المخزون، وحذفُ عميل.
--
-- ▓ ١) اسم المادة بالإنجليزي
--   المنتجات وخيارات المجموعات ومجموعاتها كلّها لها name_en منذ مدّة،
--   ومواد المخزون وحدها بقيت باسمٍ واحد. فالكاشير على الإنجليزي يفتح
--   «تسجيل هدر» فيرى قائمةً عربيةً بالكامل -- نصفُ الشاشة مترجَم
--   ونصفُها لا، وهو أسوأ من عدم الترجمة: يبدو عطلًا لا خيارًا.
--
--   ولا يُشترط ملؤه: من تركه فارغًا يرى الاسم العربي كما هو اليوم،
--   تمامًا كما تفعل بقيّة الحقول الإنجليزية في هذا النظام.
--
-- ▓ ٢) حذف عميل
--   ما كان له سبيل إطلاقًا -- لا زرّ في شاشة العملاء ولا في أعضاء
--   الولاء. ورقمُ جوالٍ يُكتب خطأً يبقى عضوًا إلى الأبد.
--
--   ولا يُحذف بـdelete مباشرة: orders.customer_id مفتاحٌ أجنبيّ بلا
--   قاعدة حذف (no action)، فمحاولةُ حذف عميلٍ له طلبٌ واحد تفشل
--   برسالةِ قاعدة بيانات لا يفهمها أحد. والأهمّ أنّ حذفه بالتتالي --
--   لو أُضيفت cascade -- كان سيمحو طلباته من المبيعات، وهي مالٌ وقع
--   فعلًا ولا علاقة له بمن اشترى.
--
--   فالطلبات تُفصَل عنه ولا تُمسّ: customer_id تصير null، فيبقى
--   الطلب ومبلغه وأصنافه في كل تقرير كما هي، ويسقط الاسم وحده.

-- ══ ١) الاسم الإنجليزي ══════════════════════════════════════
alter table stock_items add column if not exists name_en text;

comment on column stock_items.name_en is
  'اسم المادة بالإنجليزي -- اختياري. يظهر للكاشير حين تكون لغة الشاشة إنجليزية، وإلا فالاسم العربي.';

-- ══ ٢) حذف عميل ════════════════════════════════════════════
create or replace function rk_delete_customer(p_customer_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $delcust$
declare
  v_business_id bigint := current_business_id();
  v_cust        record;
  v_orders      int;
begin
  if v_business_id is null
     or not (has_permission('screen:customers') or has_permission('screen:loyalty')) then
    raise exception 'not authorized';
  end if;

  select * into v_cust from customers
  where id = p_customer_id and business_id = v_business_id;
  if v_cust is null then
    raise exception 'customer not found';
  end if;

  select count(*) into v_orders from orders
  where customer_id = p_customer_id and business_id = v_business_id;

  -- الطلبات تبقى، ويسقط اسمُ صاحبها وحده. مبيعاتُ الأمس لا تتغيّر لأن
  -- أحدًا حُذف اليوم.
  update orders set customer_id = null
  where customer_id = p_customer_id and business_id = v_business_id;

  -- سجلّ تعديلات رصيده: موضوعُه ذهب، فلا معنى لبقائه. وهو not null
  -- بلا قاعدة حذف، فيمنع الحذف لو تُرك.
  delete from loyalty_adjustments where customer_id = p_customer_id;

  -- والباقي (بطاقات المحفظة، طلبات الاستبدال، رموز الإضافة) يسقط
  -- بالتتالي -- كلّها معرَّفة on delete cascade.
  delete from customers where id = p_customer_id and business_id = v_business_id;

  return jsonb_build_object(
    'ok', true,
    'name', v_cust.name,
    'ordersDetached', v_orders
  );
end;
$delcust$;

revoke all    on function rk_delete_customer(bigint) from public, anon;
grant execute on function rk_delete_customer(bigint) to authenticated;
