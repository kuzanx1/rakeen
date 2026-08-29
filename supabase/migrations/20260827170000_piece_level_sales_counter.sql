-- Counters can now target either a menu item (as before — "how many boxes
-- sold") or a stock item that's used as a component across several menu
-- items (e.g. "ورق عنب" appears inside several different box types) — "how
-- many pieces of this ingredient sold in total, across every product that
-- uses it". The second mode only works for a stock item the owner already
-- chose to declare as a box's "bill of contents" (menu_item_box_default_mix)
-- or a recipe line — it's an OPT-IN capability, not a requirement forced
-- back onto owners using the recipe-free finished-good model from before.
-- Declaring "this box has 15 pieces of ورق عنب" is a portion count a
-- customer could count themselves by opening the box — meaningfully
-- different from disclosing the actual cooking recipe (spice ratios,
-- marinade, technique) of a single piece, which never enters Rakeen at any
-- level under this model.
--
-- Known accuracy limit, stated plainly: for a true build-your-own box, this
-- counts against the box's DECLARED default mix, not each customer's actual
-- picks that day (order_items doesn't persist the specific selections made
-- at checkout, only the resulting stock decrement) — same approximation
-- already used for that box's margin display elsewhere in the app, not a
-- new one introduced here.
alter table sales_counters alter column menu_item_id drop not null;
alter table sales_counters add column stock_item_id bigint references stock_items(id) on delete cascade;
alter table sales_counters add constraint sales_counters_target_shape check (
  (menu_item_id is not null and stock_item_id is null) or (menu_item_id is null and stock_item_id is not null)
);

create or replace function compute_stock_item_sales_count(p_stock_item_id bigint, p_since timestamptz)
returns numeric
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_business_id bigint;
  v_total numeric := 0;
begin
  select business_id into v_business_id from stock_items where id = p_stock_item_id;
  if v_business_id is null or v_business_id <> current_business_id() then
    return 0;
  end if;
  if not (has_permission('screen:menu') or has_permission('screen:accounting')) then
    return 0;
  end if;

  -- usage via a plain recipe line (unit-converted, same as checkout)
  select coalesce(sum(oi.qty * (case
      when rl.unit = si.unit then decrypt_recipe_qty(rl.qty)
      when rl.unit = 'g' and si.unit = 'kg' then decrypt_recipe_qty(rl.qty) / 1000
      when rl.unit = 'kg' and si.unit = 'g' then decrypt_recipe_qty(rl.qty) * 1000
      else decrypt_recipe_qty(rl.qty)
    end)), 0)
    into v_total
  from order_items oi
  join orders o on o.id = oi.order_id
  join menu_item_recipe_lines rl on rl.menu_item_id = oi.menu_item_id and rl.stock_item_id = p_stock_item_id
  join stock_items si on si.id = rl.stock_item_id
  where o.business_id = v_business_id and o.created_at >= p_since
    and (o.status = 'completed' or o.status is null) and o.payment_status is distinct from 'unpaid';

  -- usage via a box's declared default mix (its "bill of contents")
  v_total := v_total + coalesce((
    select sum(oi.qty * decrypt_recipe_qty(dm.qty))
    from order_items oi
    join orders o on o.id = oi.order_id
    join menu_item_box_default_mix dm on dm.menu_item_id = oi.menu_item_id and dm.stock_item_id = p_stock_item_id
    where o.business_id = v_business_id and o.created_at >= p_since
      and (o.status = 'completed' or o.status is null) and o.payment_status is distinct from 'unpaid'
  ), 0);

  -- the stock item sold directly as its own finished-good product
  v_total := v_total + coalesce((
    select sum(oi.qty)
    from order_items oi
    join orders o on o.id = oi.order_id
    join menu_items m on m.id = oi.menu_item_id
    where m.finished_good_stock_item_id = p_stock_item_id
      and o.business_id = v_business_id and o.created_at >= p_since
      and (o.status = 'completed' or o.status is null) and o.payment_status is distinct from 'unpaid'
  ), 0);

  return v_total;
end;
$$;
