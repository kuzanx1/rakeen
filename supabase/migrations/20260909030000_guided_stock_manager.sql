-- "موظفك في ركين" / مدير المخزون — server-side atomic + idempotent building
-- blocks for the guided Inventory flow. Every write mirrors exactly what the
-- manual "add/edit stock item" modal does (public/dashboard/rakeen-dashboard.js
-- openStockItemModal / saveStockItem): plain writes to stock_items, business
-- taken from auth.uid() (never a parameter), each re-checked the way the
-- stock_items RLS policies are (business_id = current_business_id() AND
-- has_permission('screen:inventory')). No new costing/quantity math is
-- introduced here — stock value %, weighted-average cost, sales decrements
-- all keep flowing through their existing paths untouched.
--
-- Blocks:
--   create_stock_item_guided   new stock item (par_level := starting qty, same as the manual "new item" path); op-id idempotent
--   set_stock_par_guided       set "مخزونك المعتاد" (par_level); absolute-set → naturally idempotent
--   adjust_stock_qty_guided    stock count / waste / correction — sets qty_on_hand to the real counted number; absolute-set → idempotent
--   set_stock_cost_guided      correct unit_cost directly (future sales only, exactly like the manual modal); absolute-set → idempotent
--
-- NOTE: restock-from-a-supplier is deliberately NOT here — that path is the
-- Purchases module (purchase_invoices + its weighted-average trigger); the
-- client hands off to openInvoiceModal() for it.

-- ── idempotency ledger for the one op-id-gated "create" block ────────────────
create table if not exists stock_guided_ops (
  op_id text primary key,
  business_id bigint not null references businesses(id),
  kind text not null default 'stock_item',
  stock_item_id bigint references stock_items(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table stock_guided_ops enable row level security;
-- SECURITY DEFINER functions are the only writers; no client ever touches this
-- table directly, so it carries zero policies (deny-all under RLS).

-- ── 1. new stock item (op-id idempotent) ───────────────────────────────────
create or replace function create_stock_item_guided(
  p_op_id text,
  p_name text,
  p_category text,             -- 'raw' | 'packaging'
  p_unit text,                 -- 'kg' | 'g' | 'liter' | 'piece'
  p_unit_cost numeric,
  p_qty numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_existing bigint;
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_item_id bigint;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:inventory') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_op_id is null or length(btrim(p_op_id)) < 8 or length(p_op_id) > 100 then raise exception 'bad op id'; end if;

  -- one guided stock create per business at a time → op-replay / dup-name races impossible
  perform pg_advisory_xact_lock(hashtext('rka_stock_biz:' || v_bid::text));

  select stock_item_id into v_existing from stock_guided_ops where op_id = p_op_id;
  if v_existing is not null then
    return jsonb_build_object('stock_item_id', v_existing, 'created', false);
  end if;

  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name) > 120 then raise exception 'name too long'; end if;
  if coalesce(p_category, '') not in ('raw', 'packaging') then raise exception 'bad category'; end if;
  if coalesce(p_unit, '') not in ('kg', 'g', 'liter', 'piece') then raise exception 'bad unit'; end if;
  if p_unit_cost is null or p_unit_cost = 'NaN'::numeric or p_unit_cost < 0 or p_unit_cost > 1000000 then raise exception 'unit cost invalid'; end if;
  if p_qty is null or p_qty = 'NaN'::numeric or p_qty < 0 or p_qty > 1000000000 then raise exception 'qty invalid'; end if;

  if exists (
    select 1 from stock_items
    where business_id = v_bid and regexp_replace(btrim(name), '\s+', ' ', 'g') = v_name
  ) then
    raise exception 'duplicate stock item name';
  end if;

  -- mirrors saveStockItem()'s "new item" branch exactly: whatever quantity is
  -- entered now defines 100% (par_level := qty_on_hand).
  insert into stock_items (business_id, name, category, unit, unit_cost, qty_on_hand, par_level)
  values (v_bid, v_name, p_category, p_unit, p_unit_cost, p_qty, p_qty)
  returning id into v_item_id;

  insert into stock_guided_ops (op_id, business_id, kind, stock_item_id)
  values (p_op_id, v_bid, 'stock_item', v_item_id);

  return jsonb_build_object(
    'stock_item_id', v_item_id, 'created', true,
    'name', v_name, 'category', p_category, 'unit', p_unit,
    'unit_cost', p_unit_cost, 'qty_on_hand', p_qty, 'par_level', p_qty
  );
end;
$$;
revoke all on function create_stock_item_guided(text, text, text, text, numeric, numeric) from public, anon;
grant execute on function create_stock_item_guided(text, text, text, text, numeric, numeric) to authenticated;

-- ── 2. set "مخزونك المعتاد" (par_level) ────────────────────────────────────
create or replace function set_stock_par_guided(
  p_stock_item_id bigint,
  p_par_level numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_old numeric;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:inventory') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_par_level is null or p_par_level = 'NaN'::numeric or p_par_level < 0 or p_par_level > 1000000000 then raise exception 'par level invalid'; end if;

  perform pg_advisory_xact_lock(hashtext('rka_stock:' || p_stock_item_id::text));

  select par_level into v_old from stock_items where id = p_stock_item_id and business_id = v_bid;
  if v_old is null and not exists (select 1 from stock_items where id = p_stock_item_id and business_id = v_bid) then
    raise exception 'stock item not found';
  end if;

  update stock_items set par_level = p_par_level, updated_at = now()
  where id = p_stock_item_id and business_id = v_bid;

  return jsonb_build_object('ok', true, 'par_level', p_par_level, 'old_par_level', coalesce(v_old, 0));
end;
$$;
revoke all on function set_stock_par_guided(bigint, numeric) from public, anon;
grant execute on function set_stock_par_guided(bigint, numeric) to authenticated;

-- ── 3. stock count / waste / correction (sets qty_on_hand) ─────────────────
create or replace function adjust_stock_qty_guided(
  p_stock_item_id bigint,
  p_new_qty numeric,
  p_reason text                -- 'count' | 'waste' | 'correction' | 'received'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_old numeric;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:inventory') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_new_qty is null or p_new_qty = 'NaN'::numeric or p_new_qty < 0 or p_new_qty > 1000000000 then raise exception 'qty invalid'; end if;
  if coalesce(p_reason, '') not in ('count', 'waste', 'correction', 'received') then raise exception 'bad reason'; end if;

  perform pg_advisory_xact_lock(hashtext('rka_stock:' || p_stock_item_id::text));

  select qty_on_hand into v_old from stock_items where id = p_stock_item_id and business_id = v_bid;
  if v_old is null and not exists (select 1 from stock_items where id = p_stock_item_id and business_id = v_bid) then
    raise exception 'stock item not found';
  end if;

  -- absolute set — same write the manual modal's "الكمية المتوفّرة الآن" field
  -- makes; re-running with the same target qty lands on the same state.
  update stock_items set qty_on_hand = p_new_qty, updated_at = now()
  where id = p_stock_item_id and business_id = v_bid;

  return jsonb_build_object(
    'ok', true, 'old_qty', coalesce(v_old, 0), 'new_qty', p_new_qty,
    'delta', round(p_new_qty - coalesce(v_old, 0), 4), 'reason', p_reason
  );
end;
$$;
revoke all on function adjust_stock_qty_guided(bigint, numeric, text) from public, anon;
grant execute on function adjust_stock_qty_guided(bigint, numeric, text) to authenticated;

-- ── 4. correct unit_cost directly (future sales only) ─────────────────────
create or replace function set_stock_cost_guided(
  p_stock_item_id bigint,
  p_unit_cost numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_old numeric;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:inventory') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_unit_cost is null or p_unit_cost = 'NaN'::numeric or p_unit_cost < 0 or p_unit_cost > 1000000 then raise exception 'unit cost invalid'; end if;

  perform pg_advisory_xact_lock(hashtext('rka_stock:' || p_stock_item_id::text));

  select unit_cost into v_old from stock_items where id = p_stock_item_id and business_id = v_bid;
  if v_old is null and not exists (select 1 from stock_items where id = p_stock_item_id and business_id = v_bid) then
    raise exception 'stock item not found';
  end if;

  -- direct set — exactly the manual modal's "edit" branch. cost_at_sale on
  -- past order_items is untouched, so history keeps its real cost; only future
  -- sales price against the new number. The weighted-average path (a real
  -- purchase) stays in the Purchases module.
  update stock_items set unit_cost = p_unit_cost, updated_at = now()
  where id = p_stock_item_id and business_id = v_bid;

  return jsonb_build_object('ok', true, 'old_cost', coalesce(v_old, 0), 'unit_cost', p_unit_cost);
end;
$$;
revoke all on function set_stock_cost_guided(bigint, numeric) from public, anon;
grant execute on function set_stock_cost_guided(bigint, numeric) to authenticated;
