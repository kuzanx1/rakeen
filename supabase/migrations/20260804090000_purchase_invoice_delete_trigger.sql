-- Mirrors bump_stock_on_purchase_invoice() in reverse, so deleting (or
-- editing, implemented client-side as delete-then-reinsert) a purchase
-- correctly reverts qty_on_hand and the weighted-average unit_cost, instead
-- of leaving a mistaken entry's effect stuck in the stock item forever.
-- Exact reversal when this was the most recent purchase for the item; a
-- reasonable approximation otherwise (weighted averages aren't perfectly
-- invertible once later purchases have blended in) — same trade-off every
-- simple moving-average inventory system accepts, there is no ledger replay.
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
    else v_current_cost
  end;

  update stock_items
  set qty_on_hand = v_new_qty,
      unit_cost = v_new_cost,
      updated_at = now()
  where id = old.stock_item_id;
  return old;
end;
$$;

create trigger purchase_invoice_reverts_stock
  after delete on purchase_invoices
  for each row execute function revert_stock_on_purchase_invoice_delete();
