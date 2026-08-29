-- revert_stock_on_purchase_invoice_delete() left unit_cost untouched when a
-- delete brought qty_on_hand down to exactly 0 — confirmed today: deleting a
-- bad purchase correctly zeroed the quantity but left unit_cost stuck at
-- whatever polluted weighted-average value the bad purchase produced,
-- meaning the item's *next* real purchase would blend a wrong starting cost
-- into its new weighted average. An empty item (qty=0) has no stock left to
-- price, so 0 is the only value that can't be wrong.
create or replace function revert_stock_on_purchase_invoice_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  return old;
end;
$$;
