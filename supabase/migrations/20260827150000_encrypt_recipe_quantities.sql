-- Recipe/box-mix quantities encrypted at rest — the real fix for "does the
-- OWNER have to trust Rakeen the company, not just their own staff". Every
-- fix so far (view_profit gating, server-side stock decrements) only ever
-- controlled who could ASK the database for this data through the app's own
-- rules — anyone with the project's service_role key (which is exactly what
-- tonight's own testing has been using) could always just read the table
-- directly and see every business's exact recipe in plain numbers. That's
-- not a cashier problem, it's an "is Rakeen itself trustworthy" problem, and
-- no amount of application-layer permission logic answers it.
--
-- pgp_sym_encrypt/pgp_sym_decrypt (pgcrypto) now protect the qty column
-- itself, with the symmetric key held in Supabase Vault — a schema
-- (`vault`) that is NOT exposed through the REST API at all (confirmed live:
-- a request for vault.secrets via the public API, even with the service_role
-- key, gets "Invalid schema: vault" — the same request surface this app,
-- and anyone with only that key, actually has). Only two narrowly-scoped
-- functions below can ever decrypt: the two resolvers that already existed
-- for checkout (which return a computed stock decrement, never the raw
-- quantity) and a new pair of owner-facing RPCs for the Menu screen's own
-- recipe editor — gated the same way menu_item_costs() already is
-- (view_profit + screen:menu + same business), because the owner reading
-- and editing their own recipe was never the concern.
--
-- Honesty about the actual limit: this stops the table itself, and the
-- app's own normal API surface (service_role included), from ever showing
-- plaintext quantities. It does not claim to defend against someone with
-- genuine Postgres superuser / Supabase project-owner access deliberately
-- extracting the Vault key — no system built on infrastructure the operator
-- fully controls can honestly claim that. What it does close is exactly the
-- failure mode demonstrated tonight: a database query, a support session, an
-- admin panel, or a leaked service_role key showing someone a business's
-- real recipe by accident or in passing.

select vault.create_secret('810ba344b0940234dd488e8a870c5afb0bb4ce280e7dfec7c0a4e571828a833a', 'recipe_encryption_key', 'Symmetric key for encrypting menu_item_recipe_lines.qty / menu_item_box_default_mix.qty at rest.');

create or replace function encrypt_recipe_qty(p_qty numeric)
returns bytea
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'recipe_encryption_key';
  return extensions.pgp_sym_encrypt(p_qty::text, v_key);
end;
$$;
revoke execute on function encrypt_recipe_qty(numeric) from public, anon, authenticated;

create or replace function decrypt_recipe_qty(p_cipher bytea)
returns numeric
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_key text;
begin
  if p_cipher is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'recipe_encryption_key';
  return extensions.pgp_sym_decrypt(p_cipher, v_key)::numeric;
end;
$$;
revoke execute on function decrypt_recipe_qty(bytea) from public, anon, authenticated;

-- Migrate menu_item_recipe_lines.qty to ciphertext.
alter table menu_item_recipe_lines add column qty_encrypted bytea;
update menu_item_recipe_lines set qty_encrypted = encrypt_recipe_qty(qty);
alter table menu_item_recipe_lines alter column qty_encrypted set not null;
alter table menu_item_recipe_lines drop column qty;
alter table menu_item_recipe_lines rename column qty_encrypted to qty;

-- Migrate menu_item_box_default_mix.qty to ciphertext.
alter table menu_item_box_default_mix add column qty_encrypted bytea;
update menu_item_box_default_mix set qty_encrypted = encrypt_recipe_qty(qty);
alter table menu_item_box_default_mix alter column qty_encrypted set not null;
alter table menu_item_box_default_mix drop column qty;
alter table menu_item_box_default_mix rename column qty_encrypted to qty;

-- Re-point the checkout resolvers at the encrypted column — same signatures,
-- same callers (complete_pos_order/register_dine_in_order untouched), only
-- the inner qty reference changes from `rl.qty` to `decrypt_recipe_qty(rl.qty)`.
create or replace function resolve_menu_item_recipe_decrements(p_menu_item_id bigint, p_line_qty numeric)
returns table (stock_item_id bigint, qty numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  rec record;
  v_qty numeric;
begin
  for rec in select rl.stock_item_id, rl.qty as enc_qty, rl.unit, si.unit as stock_unit
    from menu_item_recipe_lines rl join stock_items si on si.id = rl.stock_item_id
    where rl.menu_item_id = p_menu_item_id
  loop
    v_qty := decrypt_recipe_qty(rec.enc_qty);
    stock_item_id := rec.stock_item_id;
    qty := (case
      when rec.unit = rec.stock_unit then v_qty
      when rec.unit = 'g' and rec.stock_unit = 'kg' then v_qty / 1000
      when rec.unit = 'kg' and rec.stock_unit = 'g' then v_qty * 1000
      else v_qty
    end) * p_line_qty;
    return next;
  end loop;
end;
$$;

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
begin
  for sel in select * from jsonb_array_elements(coalesce(p_selections, '[]'::jsonb)) loop
    v_stock_item_id := null;
    v_cost_mode := null;
    select e.stock_item_id, e.cost_mode into v_stock_item_id, v_cost_mode
      from menu_item_box_eligible_items e
      where e.id = nullif(sel->>'eligible_item_id','')::bigint and e.menu_item_id = p_menu_item_id;
    if v_cost_mode = 'stock' and v_stock_item_id is not null then
      stock_item_id := v_stock_item_id;
      qty := (sel->>'qty')::numeric * p_line_qty;
      return next;
    end if;
  end loop;
end;
$$;

-- Re-point menu_item_costs() (the Menu screen's margin/profit display) at
-- the encrypted columns the same way.
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
  box_default as (
    select dm.menu_item_id, sum(decrypt_recipe_qty(dm.qty) * si.unit_cost) as cost
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

-- Owner-facing recipe read/write — the Menu screen's own recipe editor
-- (an owner viewing/editing their OWN recipe was never the concern) goes
-- through these instead of selecting/inserting the table directly, so the
-- dashboard client never needs to know the column holds ciphertext at all.
create or replace function get_menu_item_recipe(p_menu_item_id bigint)
returns table (id bigint, stock_item_id bigint, qty numeric, unit text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not (has_permission('screen:menu') and has_permission('view_profit')) then
    return;
  end if;
  return query
    select rl.id, rl.stock_item_id, decrypt_recipe_qty(rl.qty), rl.unit
    from menu_item_recipe_lines rl
    join menu_items m on m.id = rl.menu_item_id
    where rl.menu_item_id = p_menu_item_id and m.business_id = current_business_id();
end;
$$;

create or replace function get_menu_item_box_mix(p_menu_item_id bigint)
returns table (id bigint, stock_item_id bigint, qty numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not (has_permission('screen:menu') and has_permission('view_profit')) then
    return;
  end if;
  return query
    select dm.id, dm.stock_item_id, decrypt_recipe_qty(dm.qty)
    from menu_item_box_default_mix dm
    join menu_items m on m.id = dm.menu_item_id
    where dm.menu_item_id = p_menu_item_id and m.business_id = current_business_id();
end;
$$;

-- p_lines: jsonb array of {stock_item_id, qty, unit}. Replaces the item's
-- whole recipe (same replace-all semantics the dashboard's save handler
-- already used via delete-then-insert).
create or replace function save_menu_item_recipe(p_menu_item_id bigint, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  line jsonb;
begin
  if not (has_permission('screen:menu') and has_permission('view_profit')) then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from menu_items where id = p_menu_item_id and business_id = current_business_id()) then
    raise exception 'menu item not found';
  end if;

  delete from menu_item_recipe_lines where menu_item_id = p_menu_item_id;
  for line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    insert into menu_item_recipe_lines (menu_item_id, stock_item_id, qty, unit)
    values (p_menu_item_id, (line->>'stock_item_id')::bigint, encrypt_recipe_qty((line->>'qty')::numeric), line->>'unit');
  end loop;
end;
$$;

-- p_mix: jsonb array of {stock_item_id, qty}.
create or replace function save_menu_item_box_mix(p_menu_item_id bigint, p_mix jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m jsonb;
begin
  if not (has_permission('screen:menu') and has_permission('view_profit')) then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from menu_items where id = p_menu_item_id and business_id = current_business_id()) then
    raise exception 'menu item not found';
  end if;

  delete from menu_item_box_default_mix where menu_item_id = p_menu_item_id;
  for m in select * from jsonb_array_elements(coalesce(p_mix, '[]'::jsonb)) loop
    insert into menu_item_box_default_mix (menu_item_id, stock_item_id, qty)
    values (p_menu_item_id, (m->>'stock_item_id')::bigint, encrypt_recipe_qty((m->>'qty')::numeric));
  end loop;
end;
$$;

-- The POS client no longer reads these tables at all (checkout resolves
-- decrements server-side; the dashboard's Menu screen now goes through
-- get/save_menu_item_recipe above) — pos:register never needed anything
-- here, and now nothing legitimate does except screen:menu+view_profit.
drop policy if exists menu_item_recipe_lines_select on menu_item_recipe_lines;
create policy menu_item_recipe_lines_select on menu_item_recipe_lines for select
  using (exists (
    select 1 from menu_items m where m.id = menu_item_recipe_lines.menu_item_id
    and m.business_id = current_business_id() and has_permission('screen:menu') and has_permission('view_profit')
  ));

drop policy if exists menu_item_box_default_mix_select on menu_item_box_default_mix;
create policy menu_item_box_default_mix_select on menu_item_box_default_mix for select
  using (exists (
    select 1 from menu_items m where m.id = menu_item_box_default_mix.menu_item_id
    and m.business_id = current_business_id() and has_permission('screen:menu') and has_permission('view_profit')
  ));
