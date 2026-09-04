-- refund_pos_order flipped an order to 'refunded' but never touched
-- stock_items -- deliberately, per its own original comment: "the original
-- per-line stock decrements aren't persisted anywhere to reverse exactly."
-- That's still true for two specific paths (see below), but not for the
-- common case: order_items already stores menu_item_id + qty for every
-- line, and resolve_menu_item_recipe_decrements()/
-- resolve_finished_good_decrement() (both STABLE, added in
-- 20260827130000/20260827160000) recompute the exact same decrement a
-- checkout would apply today from just those two values. Refunding now
-- reverses that recipe-derived amount automatically.
--
-- Two categories are NOT restocked here, because there is no data left to
-- reverse accurately:
--   1. Build-your-own-box customer picks -- order_items never persisted
--      box_selections (only used transiently during checkout), so which
--      eligible items the customer actually chose is unrecoverable.
--   2. Ad-hoc modifier-linked stock decrements -- these are still
--      client-computed at checkout time (see 20260827130000's own note:
--      "Stock-linked MODIFIER extras... are left as-is for now") and never
--      stored per order_item either.
-- Both are real, narrower paths than the plain recipe/finished-good case --
-- restock those two manually, same as before this migration.
--
-- Also worth knowing: this recomputes from the menu item's CURRENT recipe,
-- not whatever recipe was live at sale time (order_items doesn't snapshot
-- that either). If a recipe changed between the sale and the refund, the
-- restocked quantity reflects today's recipe, not the historical one -- in
-- practice recipes change rarely enough that this is a real improvement
-- over never restocking at all, not a regression.
create or replace function refund_pos_order(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_business_id bigint;
  v_item record;
  v_dec record;
begin
  if not (has_permission('pos:register') or has_permission('screen:orders')) then
    raise exception 'not authorized';
  end if;

  select status, business_id into v_status, v_business_id from orders where id = p_order_id;
  if v_business_id is null or v_business_id <> current_business_id() then
    raise exception 'order not found';
  end if;
  if v_status <> 'completed' then
    raise exception 'only completed orders can be refunded';
  end if;

  update orders set status = 'refunded' where id = p_order_id;

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
end;
$$;
