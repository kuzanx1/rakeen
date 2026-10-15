-- "موظفك في ركين" / مدير المحاسبة — atomic, idempotent building blocks for the
-- guided Accounting flow. Every write mirrors exactly what the manual handlers
-- in public/dashboard/rakeen-dashboard.js do:
--   * saveExpense()  -> expense_categories upsert + general_expenses insert
--   * fixedCostsSettings save -> fixed_costs upsert (one row per business)
-- business is derived from auth.uid() via current_business_id() (never a
-- parameter); permission re-checked exactly as the RLS policies do
-- (fixed_costs_all / expense_categories_all / general_expenses_all all gate on
-- has_permission('screen:accounting')). Run this file block-by-block on the
-- target DB. Nothing here alters an existing hot table (only new objects), so
-- no lock_timeout dance is needed.

-- ── block 1: idempotency ledger for the one op-id-gated "create" block ────────
create table if not exists accounting_guided_ops (
  op_id text primary key,
  business_id bigint not null references businesses(id),
  kind text not null default 'expense',
  expense_id bigint references general_expenses(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table accounting_guided_ops enable row level security;
-- SECURITY DEFINER functions are the only writers → zero policies (deny-all to clients).

-- ── block 2: log one general expense (+ upsert its category) — op-id idempotent ──
create or replace function create_general_expense_guided(
  p_op_id text,
  p_category_name text,
  p_amount numeric,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_existing bigint;
  v_cat text := regexp_replace(btrim(coalesce(p_category_name, '')), '\s+', ' ', 'g');
  v_desc text := regexp_replace(btrim(coalesce(p_description, '')), '\s+', ' ', 'g');
  v_cat_id bigint;
  v_exp_id bigint;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:accounting') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_op_id is null or length(btrim(p_op_id)) < 8 or length(p_op_id) > 100 then raise exception 'bad op id'; end if;

  -- one guided accounting create per business at a time → op-replay / dup-category races impossible
  perform pg_advisory_xact_lock(hashtext('rka_acct_biz:' || v_bid::text));

  -- ledger check BEFORE any input validation, so a committed op replays cleanly
  -- even when checkDone probes with deliberately-invalid args
  select expense_id into v_existing from accounting_guided_ops where op_id = p_op_id;
  if v_existing is not null then
    return jsonb_build_object('expense_id', v_existing, 'created', false);
  end if;

  if v_cat = '' then raise exception 'category required'; end if;
  if length(v_cat) > 60 then raise exception 'category too long'; end if;
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount <= 0 or p_amount > 10000000 then
    raise exception 'amount invalid';
  end if;
  if v_desc = '' then raise exception 'description required'; end if;
  if length(v_desc) > 300 then raise exception 'description too long'; end if;

  -- upsert category by (business_id, name) — same unique key the manual insert relies on
  select id into v_cat_id from expense_categories where business_id = v_bid and name = v_cat limit 1;
  if v_cat_id is null then
    insert into expense_categories (business_id, name) values (v_bid, v_cat)
    returning id into v_cat_id;
  end if;

  insert into general_expenses (business_id, category_id, amount, description, created_by)
  values (v_bid, v_cat_id, round(p_amount, 2), v_desc, auth.uid())
  returning id into v_exp_id;

  insert into accounting_guided_ops (op_id, business_id, kind, expense_id)
  values (p_op_id, v_bid, 'expense', v_exp_id);

  return jsonb_build_object(
    'expense_id', v_exp_id, 'created', true,
    'category_id', v_cat_id, 'category_name', v_cat,
    'amount', round(p_amount, 2), 'description', v_desc
  );
end;
$$;
revoke all on function create_general_expense_guided(text, text, numeric, text) from public, anon;
grant execute on function create_general_expense_guided(text, text, numeric, text) to authenticated;

-- ── block 3: set the monthly fixed costs — absolute-set (naturally idempotent) ──
create or replace function set_fixed_costs_guided(
  p_rent numeric,
  p_salaries numeric,
  p_utilities numeric,
  p_other numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_rent numeric := coalesce(p_rent, 0);
  v_sal numeric := coalesce(p_salaries, 0);
  v_util numeric := coalesce(p_utilities, 0);
  v_other numeric := coalesce(p_other, 0);
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:accounting') then raise exception 'forbidden' using errcode = '42501'; end if;

  if v_rent = 'NaN'::numeric or v_sal = 'NaN'::numeric or v_util = 'NaN'::numeric or v_other = 'NaN'::numeric then
    raise exception 'value invalid';
  end if;
  if v_rent < 0 or v_sal < 0 or v_util < 0 or v_other < 0 then raise exception 'value negative'; end if;
  if v_rent > 100000000 or v_sal > 100000000 or v_util > 100000000 or v_other > 100000000 then
    raise exception 'value too large';
  end if;

  perform pg_advisory_xact_lock(hashtext('rka_acct_fixed:' || v_bid::text));

  insert into fixed_costs (business_id, rent, salaries, utilities, other, updated_at)
  values (v_bid, round(v_rent, 2), round(v_sal, 2), round(v_util, 2), round(v_other, 2), now())
  on conflict (business_id) do update set
    rent = excluded.rent, salaries = excluded.salaries,
    utilities = excluded.utilities, other = excluded.other, updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'rent', round(v_rent, 2), 'salaries', round(v_sal, 2),
    'utilities', round(v_util, 2), 'other', round(v_other, 2),
    'monthly_total', round(v_rent + v_sal + v_util + v_other, 2)
  );
end;
$$;
revoke all on function set_fixed_costs_guided(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function set_fixed_costs_guided(numeric, numeric, numeric, numeric) to authenticated;
