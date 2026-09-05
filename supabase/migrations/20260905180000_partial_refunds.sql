-- الاسترجاع الجزئي، ومحاسبته.
--
-- كان الاسترجاع كله-أو-لا-شيء: يقلب الحالة إلى 'refunded' ولا يسجّل
-- مبلغاً. فلم يكن ممكناً أن يُرجَع بعض الفاتورة، ولا أن يُعرف كم أُعيد،
-- ولا أن يظهر الاسترجاع في تسوية الوردية أصلاً -- كان الطلب يختفي من
-- حساب الدرج كأنه لم يقع.
--
-- والمبلغ المُعاد يُدفع كاشاً دائماً، فهو سحبٌ من الدرج لا إلغاءٌ لبيع:
-- فاتورة شبكة تُرجَع كاشاً تنقص الدرج فعلاً وإن لم تكن دخلته.

alter table orders add column if not exists refunded_amount numeric not null default 0;
alter table orders add column if not exists refunded_at timestamptz;
-- الوردية التي وقع فيها الاسترجاع، لا التي وقع فيها البيع: قد يُرجَع
-- بيع الأمس اليوم، والدرج الذي ينقص هو درج اليوم.
alter table orders add column if not exists refund_shift_id bigint references shifts(id);

create index if not exists orders_refund_shift_idx on orders(refund_shift_id) where refund_shift_id is not null;

-- حالة جديدة للاسترجاع الجزئي: الفاتورة لم تُلغَ، وبعضها أُعيد.
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('completed','cancelled','refunded','partially_refunded'));

comment on column orders.refunded_amount is 'إجمالي ما أُعيد من هذي الفاتورة. لا يتجاوز total أبداً.';
comment on column orders.refund_shift_id is 'الوردية التي خرج فيها المال من الدرج.';

-- الاسترجاع بمبلغ.
--
-- التحقق من السقف في القاعدة لا في الواجهة: الواجهة تمنع الخطأ، والقاعدة
-- تمنع الاحتيال. ومن يستطيع استدعاء الدالة يستطيع تمرير أي رقم.
--
-- والمخزون يُرجَع في الاسترجاع الكامل وحده: الاسترجاع الجزئي مبلغٌ لا
-- أصناف، ولا سبيل لمعرفة أيّ صنف يخصّه -- وإرجاع مخزون لم يعُد فعلاً
-- أسوأ من عدم إرجاع شيء.
create or replace function refund_pos_order(p_order_id bigint, p_amount numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_business_id bigint;
  v_total numeric;
  v_already numeric;
  v_amount numeric;
  v_new_total numeric;
  v_full boolean;
  v_shift_id bigint;
  v_item record;
  v_dec record;
begin
  if not (has_permission('pos:register') or has_permission('screen:orders')) then
    raise exception 'not authorized';
  end if;

  select status, business_id, total, coalesce(refunded_amount, 0)
    into v_status, v_business_id, v_total, v_already
  from orders where id = p_order_id
  for update;

  if v_business_id is null or v_business_id <> current_business_id() then
    raise exception 'order not found';
  end if;
  if v_status not in ('completed', 'partially_refunded') then
    raise exception 'only completed orders can be refunded';
  end if;

  -- غياب المبلغ يعني الباقي كله، وهو ما يريده من ضغط "كامل المبلغ".
  v_amount := coalesce(p_amount, v_total - v_already);

  if v_amount <= 0 then
    raise exception 'refund amount must be positive';
  end if;
  if v_already + v_amount > v_total + 0.001 then
    raise exception 'refund exceeds order total';
  end if;

  v_new_total := v_already + v_amount;
  v_full := v_new_total >= v_total - 0.001;

  select id into v_shift_id from shifts
  where business_id = v_business_id and closed_at is null
  order by opened_at desc limit 1;

  update orders set
    refunded_amount = v_new_total,
    refunded_at = now(),
    refund_shift_id = coalesce(refund_shift_id, v_shift_id),
    status = case when v_full then 'refunded' else 'partially_refunded' end
  where id = p_order_id;

  if v_full then
    for v_item in
      select oi.menu_item_id, oi.qty from order_items oi
      where oi.order_id = p_order_id and oi.menu_item_id is not null
    loop
      for v_dec in select * from resolve_menu_item_recipe_decrements(v_item.menu_item_id, v_item.qty) loop
        update stock_items set qty_on_hand = qty_on_hand + v_dec.qty, updated_at = now()
        where id = v_dec.stock_item_id and business_id = v_business_id;
      end loop;
      for v_dec in select * from resolve_finished_good_decrement(v_item.menu_item_id, v_item.qty) loop
        update stock_items set qty_on_hand = qty_on_hand + v_dec.qty, updated_at = now()
        where id = v_dec.stock_item_id and business_id = v_business_id;
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'refunded', v_amount,
    'refunded_total', v_new_total,
    'remaining', v_total - v_new_total,
    'full', v_full
  );
end;
$$;
