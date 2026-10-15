-- "موظفك في ركين" / مدير المنتجات — server-side atomic + idempotent building
-- blocks. Every write the guided flow makes goes through one of these; each
-- re-checks auth the same way the RLS policies do (business from auth.uid(),
-- never a parameter), and each is safe to replay.
--
-- Blocks:
--   create_menu_item_guided        base product (+ optional size group), op-id idempotent
--   set_menu_item_cost_guided      direct cost OR recipe-from-stock (replace-all → idempotent)
--   attach_menu_item_groups_guided link existing modifier groups (on-conflict → idempotent)
--   create_modifier_group_guided   build one new modifier group + options + link, op-id idempotent

-- ── idempotency ledger for the two op-id-gated "create" blocks ────────────────
create table if not exists menu_item_guided_ops (
  op_id text primary key,
  business_id bigint not null references businesses(id),
  kind text not null default 'product',
  menu_item_id bigint references menu_items(id) on delete cascade,
  modifier_group_id bigint references modifier_groups(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table menu_item_guided_ops enable row level security;
alter table menu_item_guided_ops add column if not exists kind text not null default 'product';
alter table menu_item_guided_ops add column if not exists modifier_group_id bigint references modifier_groups(id) on delete cascade;

-- ── 1. base product (+ optional sizes) ──────────────────────────────────────
drop function if exists create_menu_item_guided(text, text, text, numeric);
create or replace function create_menu_item_guided(
  p_op_id text,
  p_name text,
  p_category_name text,
  p_price numeric,
  p_sizes jsonb default null   -- [{ "name":"صغير", "price":12 }, ...] or null
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
  v_cat_name text := regexp_replace(btrim(coalesce(p_category_name, '')), '\s+', ' ', 'g');
  v_cat_id bigint;
  v_item_id bigint;
  v_base numeric;
  v_group_id bigint;
  v_sizes jsonb := coalesce(p_sizes, '[]'::jsonb);
  v_has_sizes boolean := jsonb_array_length(v_sizes) > 0;
  sz jsonb;
  v_opts jsonb := '[]'::jsonb;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:menu') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_op_id is null or length(btrim(p_op_id)) < 8 or length(p_op_id) > 100 then raise exception 'bad op id'; end if;

  -- one guided create per business at a time → op-replay / dup-name / dup-category races impossible
  perform pg_advisory_xact_lock(hashtext('rka_guided_biz:' || v_bid::text));

  select menu_item_id into v_existing from menu_item_guided_ops where op_id = p_op_id;
  if v_existing is not null then
    return jsonb_build_object('menu_item_id', v_existing, 'created', false);
  end if;

  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name) > 120 then raise exception 'name too long'; end if;
  if v_cat_name = '' then raise exception 'category required'; end if;
  if length(v_cat_name) > 120 then raise exception 'category too long'; end if;

  if v_has_sizes then
    if jsonb_array_length(v_sizes) < 2 then raise exception 'need at least two sizes'; end if;
    if jsonb_array_length(v_sizes) > 12 then raise exception 'too many sizes'; end if;
    for sz in select * from jsonb_array_elements(v_sizes) loop
      if btrim(coalesce(sz->>'name','')) = '' then raise exception 'size name required'; end if;
      if (sz->>'price') is null or (sz->>'price')::numeric = 'NaN'::numeric
         or (sz->>'price')::numeric < 0 or (sz->>'price')::numeric > 100000 then raise exception 'size price invalid'; end if;
    end loop;
    select min((s->>'price')::numeric) into v_base from jsonb_array_elements(v_sizes) s;
  else
    if p_price is null or p_price = 'NaN'::numeric or p_price < 0 or p_price > 100000 then raise exception 'price invalid'; end if;
    v_base := p_price;
  end if;

  if exists (
    select 1 from menu_items
    where business_id = v_bid and regexp_replace(btrim(name), '\s+', ' ', 'g') = v_name
      and active is not false and name not like '%(مؤرشف)%'
  ) then
    raise exception 'duplicate product name';
  end if;

  select id into v_cat_id from menu_categories
  where business_id = v_bid and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(v_cat_name)
  limit 1;
  if v_cat_id is null then
    insert into menu_categories (business_id, name, sort_order)
    values (v_bid, v_cat_name, coalesce((select max(sort_order) + 1 from menu_categories where business_id = v_bid), 0))
    returning id into v_cat_id;
  end if;

  insert into menu_items (business_id, category_id, name, price, cost_mode, direct_cost, link_inventory, link_profit, active)
  values (v_bid, v_cat_id, v_name, v_base, 'direct', 0, false, false, true)
  returning id into v_item_id;

  if v_has_sizes then
    insert into modifier_groups (business_id, name, name_en, type, max_select)
    values (v_bid, 'الحجم', 'Size', 'single', 1)
    returning id into v_group_id;
    for sz in select * from jsonb_array_elements(v_sizes) loop
      insert into modifier_options (group_id, name, price_delta, cost_mode, extra_cost)
      values (v_group_id, btrim(sz->>'name'), round(((sz->>'price')::numeric - v_base), 2), 'simple', 0);
      v_opts := v_opts || jsonb_build_object('name', btrim(sz->>'name'), 'price_delta', round(((sz->>'price')::numeric - v_base), 2));
    end loop;
    insert into menu_item_modifier_groups (menu_item_id, modifier_group_id) values (v_item_id, v_group_id);
  end if;

  insert into menu_item_guided_ops (op_id, business_id, kind, menu_item_id, modifier_group_id)
  values (p_op_id, v_bid, 'product', v_item_id, v_group_id);

  return jsonb_build_object(
    'menu_item_id', v_item_id, 'created', true,
    'category_id', v_cat_id, 'category_name', v_cat_name, 'base_price', v_base,
    'group_id', v_group_id, 'group_options', v_opts
  );
end;
$$;
revoke all on function create_menu_item_guided(text, text, text, numeric, jsonb) from public, anon;
grant execute on function create_menu_item_guided(text, text, text, numeric, jsonb) to authenticated;

-- ── 2. cost stage: direct number OR recipe from stock ───────────────────────
create or replace function set_menu_item_cost_guided(
  p_menu_item_id bigint,
  p_mode text,                 -- 'direct' | 'recipe'
  p_direct_cost numeric default null,
  p_recipe_lines jsonb default null  -- [{ "stock_item_id":1, "qty":0.15, "unit":"kg" }, ...]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  v_cur_mode text;
  ln jsonb;
  v_var numeric := 0;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:menu') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_mode not in ('direct','recipe') then raise exception 'bad mode'; end if;
  if p_mode = 'recipe' and not has_permission('view_profit') then
    raise exception 'recipe needs view_profit' using errcode = '42501';
  end if;
  select cost_mode into v_cur_mode from menu_items where id = p_menu_item_id and business_id = v_bid;
  if v_cur_mode is null then raise exception 'menu item not found'; end if;
  -- منتج بوكس: تكلفته تُدار من نموذج البوكس نفسه، لا من المدير
  if v_cur_mode = 'box' then raise exception 'box product' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtext('rka_cost:' || p_menu_item_id::text));

  if p_mode = 'direct' then
    if p_direct_cost is null or p_direct_cost = 'NaN'::numeric or p_direct_cost < 0 or p_direct_cost > 100000 then
      raise exception 'direct cost invalid';
    end if;
    delete from menu_item_recipe_lines where menu_item_id = p_menu_item_id;
    update menu_items set
      cost_mode = 'direct', direct_cost = p_direct_cost, direct_cost_large = null,
      link_profit = true, link_inventory = false, finished_good_stock_item_id = null,
      updated_at = now()
    where id = p_menu_item_id;
    v_var := p_direct_cost;
  else
    if p_recipe_lines is null or jsonb_array_length(p_recipe_lines) = 0 then raise exception 'recipe empty'; end if;
    if jsonb_array_length(p_recipe_lines) > 60 then raise exception 'too many lines'; end if;
    for ln in select * from jsonb_array_elements(p_recipe_lines) loop
      if (ln->>'stock_item_id') is null
         or not exists (select 1 from stock_items where id = (ln->>'stock_item_id')::bigint and business_id = v_bid) then
        raise exception 'stock item not found';
      end if;
      if (ln->>'qty') is null or (ln->>'qty')::numeric = 'NaN'::numeric or (ln->>'qty')::numeric <= 0 then
        raise exception 'qty invalid';
      end if;
      if coalesce(ln->>'unit','') not in ('kg','g','liter','piece') then raise exception 'unit invalid'; end if;
    end loop;

    delete from menu_item_recipe_lines where menu_item_id = p_menu_item_id;
    for ln in select * from jsonb_array_elements(p_recipe_lines) loop
      insert into menu_item_recipe_lines (menu_item_id, stock_item_id, qty, unit)
      values (p_menu_item_id, (ln->>'stock_item_id')::bigint,
              encrypt_recipe_qty((ln->>'qty')::numeric), ln->>'unit');
    end loop;
    update menu_items set
      cost_mode = 'recipe', direct_cost = 0, direct_cost_large = null,
      link_inventory = true, link_profit = true, finished_good_stock_item_id = null,
      updated_at = now()
    where id = p_menu_item_id;

    select coalesce(sum(
      (case
        when rl.unit = si.unit then decrypt_recipe_qty(rl.qty)
        when rl.unit = 'g'  and si.unit = 'kg' then decrypt_recipe_qty(rl.qty) / 1000
        when rl.unit = 'kg' and si.unit = 'g'  then decrypt_recipe_qty(rl.qty) * 1000
        else decrypt_recipe_qty(rl.qty)
      end) * si.unit_cost
    ), 0) into v_var
    from menu_item_recipe_lines rl join stock_items si on si.id = rl.stock_item_id
    where rl.menu_item_id = p_menu_item_id;
  end if;

  return jsonb_build_object('ok', true, 'variable_cost', round(coalesce(v_var, 0), 4));
end;
$$;
revoke all on function set_menu_item_cost_guided(bigint, text, numeric, jsonb) from public, anon;
grant execute on function set_menu_item_cost_guided(bigint, text, numeric, jsonb) to authenticated;

-- ── 3. attach existing modifier groups (additive, idempotent) ───────────────
create or replace function attach_menu_item_groups_guided(
  p_menu_item_id bigint,
  p_group_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid bigint;
  g bigint;
  v_added int := 0;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:menu') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from menu_items where id = p_menu_item_id and business_id = v_bid) then
    raise exception 'menu item not found';
  end if;
  if p_group_ids is null or array_length(p_group_ids, 1) is null then
    return jsonb_build_object('ok', true, 'added', 0);
  end if;
  if array_length(p_group_ids, 1) > 30 then raise exception 'too many groups'; end if;

  foreach g in array p_group_ids loop
    if not exists (select 1 from modifier_groups where id = g and business_id = v_bid) then
      raise exception 'modifier group not found';
    end if;
    insert into menu_item_modifier_groups (menu_item_id, modifier_group_id)
    values (p_menu_item_id, g)
    on conflict (menu_item_id, modifier_group_id) do nothing;
    if found then v_added := v_added + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added);
end;
$$;
revoke all on function attach_menu_item_groups_guided(bigint, bigint[]) from public, anon;
grant execute on function attach_menu_item_groups_guided(bigint, bigint[]) to authenticated;

-- ── 4. build one new modifier group + options + link (op-id idempotent) ─────
create or replace function create_modifier_group_guided(
  p_op_id text,
  p_menu_item_id bigint,
  p_name text,
  p_type text,                 -- 'single' | 'multiple'
  p_options jsonb              -- [{ "name":"جبن", "price_delta":5, "extra_cost":2 }, ...]
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
  v_group_id bigint;
  o jsonb;
  v_opts jsonb := '[]'::jsonb;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:menu') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_op_id is null or length(btrim(p_op_id)) < 8 or length(p_op_id) > 100 then raise exception 'bad op id'; end if;
  if p_type not in ('single','multiple') then raise exception 'bad type'; end if;
  if v_name = '' or length(v_name) > 80 then raise exception 'name invalid'; end if;
  if not exists (select 1 from menu_items where id = p_menu_item_id and business_id = v_bid) then
    raise exception 'menu item not found';
  end if;
  if p_options is null or jsonb_array_length(p_options) = 0 then raise exception 'no options'; end if;
  if jsonb_array_length(p_options) > 30 then raise exception 'too many options'; end if;

  perform pg_advisory_xact_lock(hashtext('rka_grp:' || p_op_id));

  select modifier_group_id into v_existing from menu_item_guided_ops where op_id = p_op_id;
  if v_existing is not null then
    return jsonb_build_object('group_id', v_existing, 'created', false);
  end if;

  for o in select * from jsonb_array_elements(p_options) loop
    if btrim(coalesce(o->>'name','')) = '' then raise exception 'option name required'; end if;
    if (o->>'price_delta') is not null and ((o->>'price_delta')::numeric = 'NaN'::numeric or abs((o->>'price_delta')::numeric) > 100000) then
      raise exception 'price_delta invalid';
    end if;
    if (o->>'extra_cost') is not null and ((o->>'extra_cost')::numeric = 'NaN'::numeric or (o->>'extra_cost')::numeric < 0 or (o->>'extra_cost')::numeric > 100000) then
      raise exception 'extra_cost invalid';
    end if;
  end loop;

  insert into modifier_groups (business_id, name, type, max_select)
  values (v_bid, v_name, p_type, case when p_type = 'single' then 1 else jsonb_array_length(p_options) end)
  returning id into v_group_id;

  for o in select * from jsonb_array_elements(p_options) loop
    insert into modifier_options (group_id, name, price_delta, cost_mode, extra_cost)
    values (v_group_id, btrim(o->>'name'), coalesce((o->>'price_delta')::numeric, 0), 'simple', coalesce((o->>'extra_cost')::numeric, 0));
    v_opts := v_opts || jsonb_build_object('name', btrim(o->>'name'),
      'price_delta', coalesce((o->>'price_delta')::numeric, 0), 'extra_cost', coalesce((o->>'extra_cost')::numeric, 0));
  end loop;

  insert into menu_item_modifier_groups (menu_item_id, modifier_group_id) values (p_menu_item_id, v_group_id);

  insert into menu_item_guided_ops (op_id, business_id, kind, menu_item_id, modifier_group_id)
  values (p_op_id, v_bid, 'modifier_group', p_menu_item_id, v_group_id);

  return jsonb_build_object('group_id', v_group_id, 'created', true, 'name', v_name, 'type', p_type, 'options', v_opts);
end;
$$;
revoke all on function create_modifier_group_guided(text, bigint, text, text, jsonb) from public, anon;
grant execute on function create_modifier_group_guided(text, bigint, text, text, jsonb) to authenticated;
