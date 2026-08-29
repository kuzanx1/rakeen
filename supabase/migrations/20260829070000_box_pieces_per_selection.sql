-- menu_items.total_pieces for a mixed box (cost_mode='box') is the number of
-- SELECTIONS the cashier must fill (a fixed 3 for medium, 4 for large at
-- Anoob) — not the raw ingredient piece count. Each selection is itself a
-- fixed number of real pieces (6 for medium, 9 for large), a detail that
-- lived only in the AnoobRes scraper's PIECES_PER_SELECTION_BY_BOX_SIZE
-- constant and was never represented in the schema at all. Without it,
-- computing a box's real ingredient cost from total_pieces alone silently
-- under- or over-counts by that same factor (this migration follows an
-- earlier mistake that set total_pieces to the raw piece count directly,
-- which broke the POS box-builder's own "fill N selections" progress UI).
alter table menu_items add column box_pieces_per_selection int;

update menu_items set total_pieces = 3, box_pieces_per_selection = 6 where id = 37;  -- بوكس وسط مشكّل
update menu_items set total_pieces = 4, box_pieces_per_selection = 9 where id = 38;  -- بوكس كبير مشكّل

-- Re-point menu_item_costs()'s box cost estimate at real piece counts
-- (selections × pieces-per-selection), defaulting the multiplier to 1 for
-- any box that doesn't use this selections-based UI pattern.
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
        )
      end
    end,
    case when not has_permission('view_profit') or m.cost_mode <> 'box' then null else
      coalesce(rc.cost, 0) + coalesce(br.min_unit_cost, 0) * coalesce(m.total_pieces, 0) * coalesce(m.box_pieces_per_selection, 1)
    end,
    case when not has_permission('view_profit') or m.cost_mode <> 'box' then null else
      coalesce(rc.cost, 0) + coalesce(br.max_unit_cost, 0) * coalesce(m.total_pieces, 0) * coalesce(m.box_pieces_per_selection, 1)
    end
  from menu_items m
  left join recipe_cost rc on rc.menu_item_id = m.id
  left join box_default_mix_cost bdm on bdm.menu_item_id = m.id
  left join box_default_estimate bde on bde.box_item_id = m.id
  left join box_range br on br.box_item_id = m.id
  where m.business_id = current_business_id();
end;
$$;

-- resolve_box_selection_decrements() only ever decrements real inventory for
-- 'stock'-mode eligible items (Anoob's are all 'simple', so this doesn't
-- change anything for them today), but it had the exact same
-- selections-vs-pieces bug latent for the day a business does use 'stock'
-- mode with this box UI — a division count would have decremented as if it
-- were a piece count.
create or replace function resolve_box_selection_decrements(p_menu_item_id bigint, p_line_qty numeric, p_selections jsonb)
returns table (stock_item_id bigint, qty numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  sel jsonb;
  v_stock_item_id bigint;
  v_cost_mode text;
  v_pieces_per_selection int;
begin
  select coalesce(box_pieces_per_selection, 1) into v_pieces_per_selection
    from menu_items where id = p_menu_item_id;

  for sel in select * from jsonb_array_elements(coalesce(p_selections, '[]'::jsonb)) loop
    v_stock_item_id := null;
    v_cost_mode := null;
    select e.stock_item_id, e.cost_mode into v_stock_item_id, v_cost_mode
      from menu_item_box_eligible_items e
      where e.id = nullif(sel->>'eligible_item_id','')::bigint and e.menu_item_id = p_menu_item_id;
    if v_cost_mode = 'stock' and v_stock_item_id is not null then
      stock_item_id := v_stock_item_id;
      qty := (sel->>'qty')::numeric * v_pieces_per_selection * p_line_qty;
      return next;
    end if;
  end loop;
end;
$$;
