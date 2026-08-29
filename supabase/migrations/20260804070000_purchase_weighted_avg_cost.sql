-- 1) Traceability: keep the exact line text as printed on the invoice (brand,
--    pack size, etc.) even though the purchase is linked to a generic stock
--    item for costing/recipes — lets the owner compare "what did I actually
--    buy" across invoices without polluting the stock catalog with brand SKUs.
alter table purchase_invoices add column raw_description text;

-- 2) Weighted-average costing: buying the same generic ingredient at a
-- different price (different supplier, different brand, market fluctuation)
-- should move the ingredient's costed unit_cost — recipes/menu margins must
-- reflect real purchase prices, not just the price it happened to be set at
-- once in Inventory. Standard method used by real F&B inventory systems.
create or replace function bump_stock_on_purchase_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  return new;
end;
$$;
