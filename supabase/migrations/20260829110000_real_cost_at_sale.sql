-- The dashboard's COGS figure (loadSalesRealData -> computeVariableCost) has
-- always applied ONE static average cost per menu item to every sale of it —
-- for a 'box' item that average comes from menu_item_costs()'s eligible-items
-- mean, not from what a specific order actually contained. Two real orders
-- for the same box can legitimately cost differently (a samosa-heavy medium
-- box vs a musakhan-heavy one), so the average was never going to reproduce
-- AnoobRes's real per-order numbers exactly — confirmed against the real
-- Aug 28 report, where per-order ingredient cost for the same box type
-- ranged from 9.04 to 19.86 SAR depending on what was actually picked.
--
-- This computes and stores the REAL cost of each order line at the moment of
-- sale (when the actual composition is known), the same way stock decrements
-- already get resolved server-side — so the dashboard can sum a real number
-- per order instead of re-deriving an estimate afterward.
alter table order_items add column cost_at_sale numeric;

create or replace function compute_line_cost(p_menu_item_id bigint, p_qty numeric, p_box_selections jsonb)
returns numeric
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_menu_item record;
  v_recipe_cost numeric := 0;
  v_box_cost numeric := 0;
  v_pieces_per_selection int;
  sel jsonb;
  v_eligible record;
begin
  select * into v_menu_item from menu_items where id = p_menu_item_id;
  if v_menu_item is null then
    return 0;
  end if;

  select coalesce(sum(
    (case
      when rl.unit = si.unit then decrypt_recipe_qty(rl.qty)
      when rl.unit = 'g' and si.unit = 'kg' then decrypt_recipe_qty(rl.qty) / 1000
      when rl.unit = 'kg' and si.unit = 'g' then decrypt_recipe_qty(rl.qty) * 1000
      else decrypt_recipe_qty(rl.qty)
    end) * si.unit_cost
  ), 0) into v_recipe_cost
  from menu_item_recipe_lines rl join stock_items si on si.id = rl.stock_item_id
  where rl.menu_item_id = p_menu_item_id;

  if v_menu_item.cost_mode = 'direct' then
    return round(coalesce(v_menu_item.direct_cost, 0) * p_qty, 6);
  elsif v_menu_item.cost_mode = 'recipe' then
    return round(v_recipe_cost * p_qty, 6);
  elsif v_menu_item.cost_mode = 'box' then
    v_pieces_per_selection := coalesce(v_menu_item.box_pieces_per_selection, 1);
    for sel in select * from jsonb_array_elements(coalesce(p_box_selections, '[]'::jsonb)) loop
      select coalesce(si.unit_cost, e.extra_cost, 0) as piece_cost into v_eligible
        from menu_item_box_eligible_items e
        left join stock_items si on si.id = e.stock_item_id
        where e.id = nullif(sel->>'eligible_item_id','')::bigint and e.menu_item_id = p_menu_item_id;
      if found then
        v_box_cost := v_box_cost + (sel->>'qty')::numeric * v_pieces_per_selection * v_eligible.piece_cost;
      end if;
    end loop;
    return round((v_recipe_cost + v_box_cost + coalesce(v_menu_item.box_packaging_cost, 0)) * p_qty, 6);
  end if;
  return 0;
end;
$$;

revoke all on function compute_line_cost(bigint, numeric, jsonb) from public, anon, authenticated;
