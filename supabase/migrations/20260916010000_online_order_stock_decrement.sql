-- الطلبات الإلكترونية ما كانت تنقص المخزون إطلاقًا.
--
-- خصم الوصفات يقع في مكانين فقط: complete_pos_order (بيع الكاشير)
-- و register_dine_in_order (تسجيل طلب طاولة). أما طلب المتجر الإلكتروني
-- فيدخل عبر submit_online_order ثم accept_online_order، وليس في أيٍّ
-- منهما سطرٌ واحد يمسّ stock_items -- ولا مُشغِّل يغطّيه (المُشغِّل الوحيد
-- على order_items هو الاستهلاك غير المباشر، وهو ميزةٌ أخرى).
--
-- فمطعمٌ يبيع من متجره الإلكتروني يرى مخزونه ثابتًا مهما باع، وتقارير
-- التكلفة والنواقص كلها مبنية على رقمٍ لا ينزل.
--
-- الخصم يقع عند القبول لا عند الإرسال، وهذا مقصود:
--   * الطلب المرفوض لا يُخصم أصلًا، فلا يحتاج إرجاعًا.
--   * والقبول محميٌّ بطبيعته من التكرار: شرطه status = 'pending'، فنداءٌ
--     ثانٍ لا يجد ما يحدّثه ويرفع الاستثناء قبل أن يصل إلى الخصم.
--
-- ويخصم ما يملك بياناته فقط: أسطر الوصفة، والصنف الجاهز المرتبط. أما
-- اختيارات البوكس وإضافات الخيارات المرتبطة بالمخزون فلا عمود يحملها في
-- order_items أصلًا (تصل في POS داخل حمولة النداء لا في الجدول)، فلا
-- تُخمَّن هنا.

create or replace function accept_online_order(p_order_id bigint)
returns table(id bigint, status text)
language plpgsql
security definer
set search_path = public
as $accept$
declare
  v_business_id bigint := current_business_id();
  v_business record;
  v_channel text;
  v_auto_ready boolean;
  v_accepted_id bigint;
  it record;
  dec_row record;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;

  select * into v_business from businesses where businesses.id = v_business_id;
  select orders.channel into v_channel from orders where orders.id = p_order_id and orders.business_id = v_business_id;
  v_auto_ready := case v_channel
    when 'pickup' then v_business.auto_ready_pickup
    when 'delivery' then v_business.auto_ready_delivery_online
    else false
  end;

  update orders set
    status = 'completed',
    cashier_id = auth.uid(),
    ready_at = case when v_auto_ready then now() else orders.ready_at end,
    prep_duration_seconds = case when v_auto_ready then extract(epoch from (now() - orders.created_at))::int else orders.prep_duration_seconds end
  where orders.id = p_order_id
    and orders.business_id = v_business_id
    and orders.status = 'pending'
  returning orders.id into v_accepted_id;

  if v_accepted_id is null then
    raise exception 'الطلب غير متاح للقبول — يمكن تم التعامل معه من جهاز آخر';
  end if;

  -- الخصم، بنفس منطق complete_pos_order حرفيًا: نفس الدالتين، ونفس شرط
  -- business_id على التحديث حتى لا يُمسّ مخزون منشأة أخرى.
  for it in
    select oi.menu_item_id, oi.qty
    from order_items oi
    where oi.order_id = v_accepted_id and oi.menu_item_id is not null
  loop
    for dec_row in select * from resolve_menu_item_recipe_decrements(it.menu_item_id, it.qty) loop
      update stock_items set qty_on_hand = qty_on_hand - dec_row.qty, updated_at = now()
      where stock_items.id = dec_row.stock_item_id and stock_items.business_id = v_business_id;
    end loop;

    for dec_row in select * from resolve_finished_good_decrement(it.menu_item_id, it.qty) loop
      update stock_items set qty_on_hand = qty_on_hand - dec_row.qty, updated_at = now()
      where stock_items.id = dec_row.stock_item_id and stock_items.business_id = v_business_id;
    end loop;
  end loop;

  return query select v_accepted_id, 'completed'::text;
end;
$accept$;
