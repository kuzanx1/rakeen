-- Full tenant deletion for the platform-admin console — removes a business
-- and every row scoped to it, for good, in one atomic transaction (a single
-- plpgsql function call is one implicit transaction: if any statement below
-- fails, e.g. from a table this function forgot to account for, the whole
-- thing rolls back cleanly with nothing partially deleted — safe to fix and
-- retry). Deliberately NOT granted to anon/authenticated — only callable via
-- the service-role client from app/api/admin/businesses/[id]/route.ts, which
-- gates on PLATFORM_ADMIN_EMAILS before ever reaching this function.
--
-- Ordering notes (the two things that aren't obvious from the schema alone):
--  1. orders.table_id <-> restaurant_tables.active_order_id is a genuine
--     circular FK (neither table can be deleted first without violating the
--     other) — both are nulled out up front to break the cycle.
--  2. profiles.created_by is a nullable self-reference; nulled out before
--     the bulk profiles delete so no row in the same DELETE statement can
--     trip over another row's created_by pointing at it.
-- Everything else here only needs correct ONE-WAY ordering (delete the
-- referencing table before the table it references) — cross-referenced
-- against every `references` clause in supabase/migrations at the time this
-- was written. Tables with `on delete cascade` back to something deleted
-- here (order_items, menu_item_recipe_lines/box_eligible_items/
-- box_default_mix/menu_item_modifier_groups, modifier_options,
-- menu_item_platform_prices, delivery_platform_fee_tiers,
-- loyalty_redemption_requests, push_subscriptions, user_permissions,
-- owner_push_subscriptions) are intentionally NOT listed below — Postgres
-- removes them automatically.
create or replace function delete_business_completely(p_business_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from businesses where id = p_business_id;
  if v_name is null then
    raise exception 'business_not_found';
  end if;

  update orders set table_id = null where business_id = p_business_id;
  update restaurant_tables set active_order_id = null where business_id = p_business_id;
  update profiles set created_by = null where business_id = p_business_id;

  delete from shift_closing_reports where business_id = p_business_id;
  delete from restaurant_tables where business_id = p_business_id;
  delete from orders where business_id = p_business_id;
  delete from shifts where business_id = p_business_id;
  delete from staff_members where business_id = p_business_id;
  delete from purchase_invoices where business_id = p_business_id;
  delete from general_expenses where business_id = p_business_id;
  delete from report_exports where business_id = p_business_id;
  delete from invoice_scan_events where business_id = p_business_id;
  delete from supplier_invoice_patterns where business_id = p_business_id;

  delete from menu_items where business_id = p_business_id;
  delete from modifier_groups where business_id = p_business_id;
  delete from delivery_platforms where business_id = p_business_id;
  delete from menu_categories where business_id = p_business_id;
  delete from stock_items where business_id = p_business_id;
  delete from suppliers where business_id = p_business_id;
  delete from expense_categories where business_id = p_business_id;
  delete from customers where business_id = p_business_id;
  delete from fixed_costs where business_id = p_business_id;

  delete from profiles where business_id = p_business_id;
  delete from branches where business_id = p_business_id;

  delete from businesses where id = p_business_id;

  return v_name;
end;
$$;

-- No grant to anon/authenticated by design — service_role already bypasses
-- RLS and has default execute rights, so this is reachable only from
-- trusted server-side admin code.
