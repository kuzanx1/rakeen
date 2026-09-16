-- الاسترجاع لا يُعيد الاستهلاك التلقائي -- فكل استرجاع يأكل من المخزون.
--
-- البيع يخصم من مصدرين:
--   ١) وصفة الصنف + الصنف الجاهز، داخل complete_pos_order/register_dine_in_order
--   ٢) الاستهلاك التلقائي (أكواب، فلاتر، مناديل...) عبر التريغر
--      trg_apply_indirect_consumption على order_items
--
-- أما refund_pos_order_lines فيُعيد الأول وحده. والسبب تاريخي: دالة
-- الاسترجاع (20260907090000) كُتبت قبل ميزة الاستهلاك التلقائي
-- (20260909110000)، ولم يُعَد النظر فيها يوم أُضيفت.
--
-- فمقهى يبيع مئة كوب ثم يسترجع عشرة: ترجع حبوب البن والحليب، ولا ترجع
-- الأكواب العشرة أبدًا. ينزاح المخزون نزولاً مع كل استرجاع، بلا أثرٍ
-- ظاهر ولا خطأ.
--
-- العلاج تريغرٌ مقابلٌ للأول، بنفس صيغته بالضبط وبإشارةٍ معكوسة:
--   البيع:     order_items        after insert -> ينقص
--   الاسترجاع: order_refund_items after insert -> يزيد
--
-- ولم تُمسّ refund_pos_order_lines نفسها -- وهي دالةٌ ماليّة طويلة تحسب
-- المبالغ والولاء وحالة الطلب. التناظر هنا أسلم من إعادة كتابتها، وهو
-- أصدق وصفًا للواقع: الخصم نفسه يقع في تريغر لا داخلها.
--
-- ملاحظة على الدقّة: العكس يُحسب من القواعد الحالية، تمامًا كما يفعل
-- إرجاع الوصفة (يقرأ menu_item_recipe_lines الحالية). فلو غُيّرت قاعدة
-- بين البيع والاسترجاع، يتبع الاثنان القاعدة الجديدة -- سلوكٌ قائمٌ
-- أصلاً، لا جديد يُستحدث هنا.

create or replace function restore_indirect_consumption()
returns trigger
language plpgsql
security definer
set search_path = public
as $restore$
declare
  v_business_id bigint;
  v_category_id bigint;
  r             record;
begin
  if new.menu_item_id is null then
    return new;
  end if;

  -- المنشأة والفئة من الطلب الأصلي، بنفس ما يفعله تريغر البيع.
  select o.business_id, mi.category_id
    into v_business_id, v_category_id
  from order_items oi
  join orders o     on o.id = oi.order_id
  join menu_items mi on mi.id = new.menu_item_id
  where oi.id = new.order_item_id;

  if v_business_id is null then
    return new;
  end if;

  for r in
    select icr.stock_item_id,
           (icr.deduct_qty / icr.per_qty::numeric) * new.qty as inc_qty
    from indirect_consumption_rules icr
    where icr.business_id = v_business_id
      and exists (
        select 1 from indirect_consumption_rule_targets t
        where t.rule_id = icr.id
          and ( t.menu_item_id = new.menu_item_id
             or (v_category_id is not null and t.menu_category_id = v_category_id) )
      )
  loop
    update stock_items
       set qty_on_hand = qty_on_hand + r.inc_qty, updated_at = now()
     where id = r.stock_item_id and business_id = v_business_id;
  end loop;

  return new;
end;
$restore$;

set lock_timeout = '5s';
drop trigger if exists trg_restore_indirect_consumption on order_refund_items;
create trigger trg_restore_indirect_consumption
  after insert on order_refund_items
  for each row execute function restore_indirect_consumption();
reset lock_timeout;
