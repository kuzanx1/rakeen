-- "موظفك في ركين" / مدير المشتريات — one atomic, idempotent block that records
-- a whole supplier invoice the exact way the manual "سجّل فاتورة مشتريات" modal
-- does (saveInvoice in public/dashboard/rakeen-dashboard.js):
--   * upsert the supplier by name  (suppliers, unique(business_id,name), vat_registered synced)
--   * create any brand-new stock item  (category 'raw', qty_on_hand 0, par_level = qty*2, unit_cost = total/qty)
--   * insert every line into purchase_invoices under ONE invoice_group_id
--   * the existing trigger `purchase_invoice_bumps_stock` does the weighted-average
--     unit_cost + qty_on_hand bump per row — NOT re-implemented here
--   * per-line vat_amount extracted from the VAT-inclusive total for a
--     VAT-registered supplier, same formula as compute_vat_split(p_inclusive=true)
--
-- business is from auth.uid() (never a parameter); permission re-checked the way
-- the RLS policies are (screen:accounting OR screen:purchases) — plus
-- screen:inventory when a line creates a new stock item, mirroring the real
-- boundary (stock_items_insert requires screen:inventory).

create table if not exists purchase_guided_ops (
  op_id text primary key,
  business_id bigint not null references businesses(id),
  kind text not null default 'purchase_invoice',
  invoice_group_id uuid,
  created_at timestamptz not null default now()
);
alter table purchase_guided_ops enable row level security;
-- SECURITY DEFINER functions are the only writers → zero policies (deny-all under RLS).

create or replace function create_purchase_invoice_guided(
  p_op_id text,
  p_supplier_name text,
  p_supplier_vat_registered boolean,
  p_invoiced_at timestamptz,
  p_invoice_number text,
  p_lines jsonb   -- [{ "kind":"existing","stock_item_id":1,"qty":10,"total_cost":180 }
                  --  |{ "kind":"new","name":"دقيق","unit":"kg","qty":25,"total_cost":90 }, ...]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_existing uuid;
  v_sup text := regexp_replace(btrim(coalesce(p_supplier_name, '')), '\s+', ' ', 'g');
  v_sup_id bigint;
  v_gid uuid;
  v_rate numeric;
  v_at timestamptz := coalesce(p_invoiced_at, now());
  v_num text := nullif(btrim(coalesce(p_invoice_number, '')), '');
  v_vatreg boolean := coalesce(p_supplier_vat_registered, true);
  ln jsonb;
  v_has_new boolean := false;
  v_name text;
  v_unit text;
  v_qty numeric;
  v_total numeric;
  v_sid bigint;
  v_vat numeric;
  v_line_count int := 0;
  v_grand numeric := 0;
  v_vat_total numeric := 0;
  v_new_items jsonb := '[]'::jsonb;
  v_stock_after jsonb := '[]'::jsonb;
  v_touched bigint[] := '{}';
  r record;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (has_permission('screen:accounting') or has_permission('screen:purchases')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_op_id is null or length(btrim(p_op_id)) < 8 or length(p_op_id) > 100 then raise exception 'bad op id'; end if;

  -- one guided purchase per business at a time → op-replay / dup-supplier races impossible
  perform pg_advisory_xact_lock(hashtext('rka_purch_biz:' || v_bid::text));

  select invoice_group_id into v_existing from purchase_guided_ops where op_id = p_op_id;
  if v_existing is not null then
    return jsonb_build_object('invoice_group_id', v_existing, 'created', false);
  end if;

  if v_sup = '' then raise exception 'supplier required'; end if;
  if length(v_sup) > 120 then raise exception 'supplier name too long'; end if;
  if v_at > now() + interval '2 days' then raise exception 'invoiced_at in the future'; end if;
  if v_at < now() - interval '400 days' then raise exception 'invoiced_at too old'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'no lines'; end if;
  if jsonb_array_length(p_lines) > 40 then raise exception 'too many lines'; end if;

  for ln in select * from jsonb_array_elements(p_lines) loop
    if coalesce(ln->>'kind', '') = 'new' then v_has_new := true; end if;
  end loop;
  if v_has_new and not has_permission('screen:inventory') then
    raise exception 'new stock item needs screen:inventory' using errcode = '42501';
  end if;

  select coalesce(vat_rate, 0.15) into v_rate from businesses where id = v_bid;
  v_rate := coalesce(v_rate, 0.15);

  -- supplier upsert (unique(business_id,name)); keep master vat_registered in sync
  select id into v_sup_id from suppliers where business_id = v_bid and name = v_sup;
  if v_sup_id is null then
    begin
      insert into suppliers (business_id, name, vat_registered) values (v_bid, v_sup, v_vatreg)
      returning id into v_sup_id;
    exception when unique_violation then
      select id into v_sup_id from suppliers where business_id = v_bid and name = v_sup;
    end;
  else
    update suppliers set vat_registered = v_vatreg
    where id = v_sup_id and vat_registered is distinct from v_vatreg;
  end if;

  v_gid := gen_random_uuid();

  for ln in select * from jsonb_array_elements(p_lines) loop
    v_qty := (ln->>'qty')::numeric;
    v_total := (ln->>'total_cost')::numeric;
    if v_qty is null or v_qty = 'NaN'::numeric or v_qty <= 0 or v_qty > 1000000000 then raise exception 'qty invalid'; end if;
    if v_total is null or v_total = 'NaN'::numeric or v_total <= 0 or v_total > 1000000000 then raise exception 'total invalid'; end if;

    if coalesce(ln->>'kind', '') = 'new' then
      v_name := regexp_replace(btrim(coalesce(ln->>'name', '')), '\s+', ' ', 'g');
      v_unit := ln->>'unit';
      if v_name = '' or length(v_name) > 120 then raise exception 'new item name invalid'; end if;
      if coalesce(v_unit, '') not in ('kg', 'g', 'liter', 'piece') then raise exception 'unit invalid'; end if;
      if exists (select 1 from stock_items where business_id = v_bid
                 and regexp_replace(btrim(name), '\s+', ' ', 'g') = v_name) then
        raise exception 'duplicate stock item name';
      end if;
      -- mirrors saveInvoice()'s new-item branch exactly
      insert into stock_items (business_id, name, category, unit, unit_cost, qty_on_hand, par_level)
      values (v_bid, v_name, 'raw', v_unit, round(v_total / v_qty, 6), 0, v_qty * 2)
      returning id into v_sid;
      v_new_items := v_new_items || jsonb_build_object('id', v_sid, 'name', v_name, 'unit', v_unit);
    else
      v_sid := (ln->>'stock_item_id')::bigint;
      select unit into v_unit from stock_items where id = v_sid and business_id = v_bid;
      if v_unit is null then raise exception 'stock item not found'; end if;
    end if;

    -- VAT-inclusive supplier total → extract this line's VAT (only for a
    -- VAT-registered supplier); identical to compute_vat_split(inclusive=true).
    v_vat := case when v_vatreg then round(v_total * v_rate / (1 + v_rate), 2) else null end;

    insert into purchase_invoices
      (business_id, stock_item_id, supplier_id, qty, unit, total_cost, vat_amount, created_by, invoice_group_id, invoiced_at, invoice_number)
    values
      (v_bid, v_sid, v_sup_id, v_qty, v_unit, v_total, v_vat, auth.uid(), v_gid, v_at, v_num);
    -- trigger purchase_invoice_bumps_stock runs here: qty_on_hand += qty, unit_cost := weighted average

    v_line_count := v_line_count + 1;
    v_grand := v_grand + v_total;
    if v_vat is not null then v_vat_total := v_vat_total + v_vat; end if;
    v_touched := array_append(v_touched, v_sid);
  end loop;

  insert into purchase_guided_ops (op_id, business_id, kind, invoice_group_id)
  values (p_op_id, v_bid, 'purchase_invoice', v_gid);

  -- stock state AFTER the trigger applied → exact server truth for the client to show
  for r in select id, qty_on_hand, unit_cost, name, unit from stock_items
           where business_id = v_bid and id = any(v_touched) loop
    v_stock_after := v_stock_after || jsonb_build_object(
      'id', r.id, 'qty_on_hand', r.qty_on_hand, 'unit_cost', r.unit_cost, 'name', r.name, 'unit', r.unit);
  end loop;

  return jsonb_build_object(
    'invoice_group_id', v_gid, 'created', true,
    'supplier_id', v_sup_id, 'supplier_name', v_sup, 'supplier_vat_registered', v_vatreg,
    'line_count', v_line_count, 'grand_total', round(v_grand, 2), 'vat_total', round(v_vat_total, 2),
    'new_items', v_new_items, 'stock_after', v_stock_after
  );
end;
$$;
revoke all on function create_purchase_invoice_guided(text, text, boolean, timestamptz, text, jsonb) from public, anon;
grant execute on function create_purchase_invoice_guided(text, text, boolean, timestamptz, text, jsonb) to authenticated;
