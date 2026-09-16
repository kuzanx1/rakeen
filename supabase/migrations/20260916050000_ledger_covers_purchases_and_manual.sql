-- السجلّ يشمل الإضافة كما يشمل الخصم.
--
-- سجلّ الحركة (20260916030000) يكتب البيع والاسترجاع والاستهلاك
-- التلقائي. أما ما يرفع الرصيد -- فاتورة الشراء، وحذفها، والجرد اليدوي --
-- فيغيّر qty_on_hand بلا سطر. فيقرأ صاحب المطعم سجلًّا فيه نزولٌ مفسَّر
-- وقفزاتٌ صاعدة بلا سبب، وهذا أسوأ من غياب السجلّ: يبدو كأن أرقامًا
-- تظهر من لا مكان.
--
-- فكل ما يمسّ الرصيد يكتب سطره، ومن اليوم يُقرأ تاريخ أي مادة كاملاً:
-- اشتُريت، بيعت، رُجّعت، جُردت.

-- ── ١) فاتورة الشراء ────────────────────────────────────────
create or replace function bump_stock_on_purchase_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $bump$
declare
  v_current_qty numeric;
  v_current_cost numeric;
  v_new_unit_cost numeric;
begin
  select qty_on_hand, unit_cost into v_current_qty, v_current_cost
  from stock_items where id = new.stock_item_id for update;

  v_new_unit_cost := case
    when (v_current_qty + new.qty) > 0
      then (v_current_qty * v_current_cost + new.total_cost) / (v_current_qty + new.qty)
    else v_current_cost
  end;

  update stock_items
  set qty_on_hand = v_current_qty + new.qty,
      unit_cost = v_new_unit_cost,
      updated_at = now()
  where id = new.stock_item_id;

  -- السطر يُكتب هنا لا عبر rk_stock_move: التريغر يحدّث التكلفة أيضًا،
  -- ودالة الحركة تعرف الكمية وحدها.
  insert into stock_movements (business_id, stock_item_id, delta, qty_before, qty_after,
                               reason, source, note, created_by)
  values (new.business_id, new.stock_item_id, new.qty, v_current_qty, v_current_qty + new.qty,
          'purchase', 'invoice', 'فاتورة شراء #' || new.id, auth.uid());

  return new;
end;
$bump$;

-- ── ٢) حذف فاتورة شراء ──────────────────────────────────────
create or replace function revert_stock_on_purchase_invoice_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $rev$
declare
  v_current_qty numeric;
  v_current_cost numeric;
  v_new_qty numeric;
  v_new_cost numeric;
begin
  select qty_on_hand, unit_cost into v_current_qty, v_current_cost
  from stock_items where id = old.stock_item_id for update;

  v_new_qty := greatest(v_current_qty - old.qty, 0);
  v_new_cost := case
    when v_new_qty > 0 then greatest((v_current_qty * v_current_cost - old.total_cost) / v_new_qty, 0)
    else 0
  end;

  update stock_items
  set qty_on_hand = v_new_qty,
      unit_cost = v_new_cost,
      updated_at = now()
  where id = old.stock_item_id;

  insert into stock_movements (business_id, stock_item_id, delta, qty_before, qty_after,
                               reason, source, note, created_by)
  values (old.business_id, old.stock_item_id, v_new_qty - v_current_qty, v_current_qty, v_new_qty,
          'purchase', 'invoice_deleted', 'حذف فاتورة شراء #' || old.id, auth.uid());

  return old;
end;
$rev$;

-- ── ٣) الجرد / التصحيح اليدوي ───────────────────────────────
-- الرقم المُدخل هو الرصيد الحقيقي المعدود، لا مقدار الزيادة -- فالنداء
-- مُكرَّر بلا أثر (idempotent): إعادته بنفس الرقم لا تكتب سطرًا ثانيًا.
create or replace function rk_set_stock_qty(
  p_stock_item_id bigint,
  p_new_qty       numeric,
  p_note          text default null
) returns numeric
language plpgsql
security definer
set search_path = public
as $setq$
declare
  v_business_id bigint := current_business_id();
  v_before numeric;
begin
  if v_business_id is null or not has_permission('screen:inventory') then
    raise exception 'not authorized';
  end if;

  select qty_on_hand into v_before
  from stock_items
  where id = p_stock_item_id and business_id = v_business_id
  for update;

  if v_before is null then
    raise exception 'stock item not found';
  end if;

  if p_new_qty is null or abs(p_new_qty - v_before) < 0.0000001 then
    return v_before;
  end if;

  perform rk_stock_move(v_business_id, p_stock_item_id, p_new_qty - v_before,
                        'manual', 'count',
                        null, null,
                        coalesce(nullif(btrim(p_note), ''), 'تعديل يدوي للكمية'));

  return p_new_qty;
end;
$setq$;
revoke all on function rk_set_stock_qty(bigint, numeric, text) from public, anon;
grant execute on function rk_set_stock_qty(bigint, numeric, text) to authenticated;
