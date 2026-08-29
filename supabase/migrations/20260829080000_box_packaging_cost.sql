-- menu_item_costs()'s box formula only ever estimated INGREDIENT cost (via
-- eligible items). AnoobRes's real accounting always adds a separate flat
-- packaging cost per box on top of that (6.1 SAR medium / 6.5 SAR large —
-- see PACKAGING_COST_BY_BOX in the AnoobRes scraper scripts), which Rakeen
-- never modeled at all — the box cost estimate was ingredients-only. This is
-- most of the remaining gap between Rakeen's and AnoobRes's real profit
-- numbers for the same replayed orders (Rakeen overstates profit because it
-- undercounts box cost).
alter table menu_items add column box_packaging_cost numeric not null default 0;

update menu_items set box_packaging_cost = 6.1 where id = 37;  -- بوكس وسط مشكّل
update menu_items set box_packaging_cost = 6.5 where id = 38;  -- بوكس كبير مشكّل

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
          when rl.unit = si.unit then decrypt_recipe_qty(rl.qty)
          when rl.unit = 'g' and si.unit = 'kg' then decrypt_recipe_qty(rl.qty) / 1000
          when rl.unit = 'kg' and si.unit = 'g' then decrypt_recipe_qty(rl.qty) * 1000
          else decrypt_recipe_qty(rl.qty)
        end) * si.unit_cost
      ) as cost
    from menu_item_recipe_lines rl
    join stock_items si on si.id = rl.stock_item_id
    join menu_items m on m.id = rl.menu_item_id
    where m.business_id = current_business_id()
    group by rl.menu_item_id
  ),
  box_default_mix_cost as (
    select dm.menu_item_id, sum(decrypt_recipe_qty(dm.qty) * si.unit_cost) as cost
    from menu_item_box_default_mix dm
    join stock_items si on si.id = dm.stock_item_id
    join menu_items m on m.id = dm.menu_item_id
    where m.business_id = current_business_id()
    group by dm.menu_item_id
  ),
  box_eligible_piece_cost as (
    select
      e.menu_item_id as box_item_id,
      coalesce(si.unit_cost, e.extra_cost, 0) as piece_cost
    from menu_item_box_eligible_items e
    left join stock_items si on si.id = e.stock_item_id
    join menu_items m on m.id = e.menu_item_id
    where m.business_id = current_business_id()
  ),
  box_default_estimate as (
    select box_item_id, avg(piece_cost) as avg_piece_cost
    from box_eligible_piece_cost
    group by box_item_id
  ),
  box_range as (
    select box_item_id, min(piece_cost) as min_unit_cost, max(piece_cost) as max_unit_cost
    from box_eligible_piece_cost
    group by box_item_id
  )
  select
    m.id,
    case when not has_permission('view_profit') then null else
      case m.cost_mode
        when 'direct' then m.direct_cost
        when 'recipe' then coalesce(rc.cost, 0)
        when 'box' then coalesce(rc.cost, 0) + coalesce(
          bdm.cost,
          bde.avg_piece_cost * coalesce(m.total_pieces, 0) * coalesce(m.box_pieces_per_selection, 1),
          0
        ) + m.box_packaging_cost
      end
    end,
    case when not has_permission('view_profit') or m.cost_mode <> 'box' then null else
      coalesce(rc.cost, 0) + coalesce(br.min_unit_cost, 0) * coalesce(m.total_pieces, 0) * coalesce(m.box_pieces_per_selection, 1) + m.box_packaging_cost
    end,
    case when not has_permission('view_profit') or m.cost_mode <> 'box' then null else
      coalesce(rc.cost, 0) + coalesce(br.max_unit_cost, 0) * coalesce(m.total_pieces, 0) * coalesce(m.box_pieces_per_selection, 1) + m.box_packaging_cost
    end
  from menu_items m
  left join recipe_cost rc on rc.menu_item_id = m.id
  left join box_default_mix_cost bdm on bdm.menu_item_id = m.id
  left join box_default_estimate bde on bde.box_item_id = m.id
  left join box_range br on br.box_item_id = m.id
  where m.business_id = current_business_id();
end;
$$;
