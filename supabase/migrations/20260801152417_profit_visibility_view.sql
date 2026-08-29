-- Cost/margin figures for recipe- and box-mode products are derived from
-- stock_items.unit_cost, which itself sits behind the 'screen:inventory'
-- permission. A menu-only employee (screen:menu granted, screen:inventory
-- not) must still be able to see menu items at all, so a plain
-- security_invoker view over stock_items would incorrectly go blank for
-- them. Instead this is a SECURITY DEFINER function: it bypasses RLS for its
-- own internal reads (functions run as their owner, and RLS doesn't apply to
-- table owners) but re-implements the exact checks by hand — right tenant,
-- and 'view_profit' specifically, independent of any other screen access the
-- caller happens to have.
create or replace function menu_item_costs()
returns table (
  menu_item_id bigint,
  variable_cost numeric,
  variable_cost_min numeric,
  variable_cost_max numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not has_permission('screen:menu') then
    return;
  end if;

  return query
  with recipe_cost as (
    select
      rl.menu_item_id,
      sum(
        (case
          when rl.unit = si.unit then rl.qty
          when rl.unit = 'g' and si.unit = 'kg' then rl.qty / 1000
          when rl.unit = 'kg' and si.unit = 'g' then rl.qty * 1000
          else rl.qty
        end) * si.unit_cost
      ) as cost
    from menu_item_recipe_lines rl
    join stock_items si on si.id = rl.stock_item_id
    join menu_items m on m.id = rl.menu_item_id
    where m.business_id = current_business_id()
    group by rl.menu_item_id
  ),
  box_default as (
    select dm.menu_item_id, sum(dm.qty * si.unit_cost) as cost
    from menu_item_box_default_mix dm
    join stock_items si on si.id = dm.stock_item_id
    join menu_items m on m.id = dm.menu_item_id
    where m.business_id = current_business_id()
    group by dm.menu_item_id
  ),
  box_range as (
    select e.menu_item_id, min(si.unit_cost) as min_unit_cost, max(si.unit_cost) as max_unit_cost
    from menu_item_box_eligible_items e
    join stock_items si on si.id = e.stock_item_id
    join menu_items m on m.id = e.menu_item_id
    where m.business_id = current_business_id()
    group by e.menu_item_id
  )
  select
    m.id,
    case when not has_permission('view_profit') then null else
      case m.cost_mode
        when 'direct' then m.direct_cost
        when 'recipe' then coalesce(rc.cost, 0)
        when 'box' then coalesce(rc.cost, 0) + coalesce(bd.cost, 0)
      end
    end,
    case when not has_permission('view_profit') or m.cost_mode <> 'box' then null else
      coalesce(rc.cost, 0) + coalesce(br.min_unit_cost, 0) * coalesce(m.total_pieces, 0)
    end,
    case when not has_permission('view_profit') or m.cost_mode <> 'box' then null else
      coalesce(rc.cost, 0) + coalesce(br.max_unit_cost, 0) * coalesce(m.total_pieces, 0)
    end
  from menu_items m
  left join recipe_cost rc on rc.menu_item_id = m.id
  left join box_default bd on bd.menu_item_id = m.id
  left join box_range br on br.menu_item_id = m.id
  where m.business_id = current_business_id();
end;
$$;

-- NOTE: this intentionally omits the fixed-cost-per-unit allocation that
-- computeFixedCostPerUnit() adds in the current JS (it divides monthly fixed
-- costs by "today's units sold x 30" — a real sales-volume signal that only
-- exists once Orders is wired up in Phase 2). Until then this returns pure
-- variable cost (direct/recipe/box), not the full landed cost. Flagged to
-- the user directly, not silently approximated.
