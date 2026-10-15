-- ═══════════════════════════════════════════════════════════════════════════
-- نظام القياس: إضافة «مل» + جسر تحويل بين الوزن والحجم لكل صنف مخزون
--
-- المشكلة: لتر ↔ غرام ليس رقمًا ثابتًا — يعتمد على المادة (الكثافة). حليب
-- ~1030غ/لتر، زيت ~915، عسل ~1420. النظام الحالي يحوّل غ↔كجم فقط، واللتر
-- بلا وحدة فرعية ولا جسر مع الوزن.
--
-- الحل:
--   1. عمود stock_items.grams_per_unit  — «كم غرام تزن الوحدة الواحدة من
--      هذا الصنف» (للصنف باللتر = غ/لتر ~1030 ؛ للصنف بالمل = غ/مل ~1.03).
--      اختياري، يُقترح تلقائيًا حسب اسم الصنف في الواجهة.
--   2. وحدة «ml» تُضاف لقيود unit في stock_items / menu_item_recipe_lines /
--      purchase_invoices / modifier_options.
--   3. دالة تحويل واحدة  rka_to_base(qty, from_unit, stock_unit, grams_per_unit)
--      تستبدل منطق «case when unit=... then .../1000» المكرّر حرفيًا في ثلاث
--      دوال (الخصم من المخزون + عرض التكلفة + تكلفة البيع). مطابقة تمامًا
--      للسلوك القائم عندما لا يوجد «ml» ولا grams_per_unit (إثبات في التقرير).
--
-- شغّل الملف كتلة كتلة بالترتيب. تعديلات القيود ALTER على جداول يكتب فيها
-- الكاشير مباشرةً — set lock_timeout حولها.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── كتلة 1: العمود ─────────────────────────────────────────────────────────
set lock_timeout = '3s';
alter table stock_items
  add column if not exists grams_per_unit numeric
  check (grams_per_unit is null or (grams_per_unit > 0 and grams_per_unit <= 1000000));
reset lock_timeout;

-- ── كتلة 2: توسيع قيود الوحدة لتشمل 'ml' ──────────────────────────────────
set lock_timeout = '3s';
alter table stock_items drop constraint if exists stock_items_unit_check;
alter table stock_items add constraint stock_items_unit_check
  check (unit in ('kg','g','liter','ml','piece'));

alter table menu_item_recipe_lines drop constraint if exists menu_item_recipe_lines_unit_check;
alter table menu_item_recipe_lines add constraint menu_item_recipe_lines_unit_check
  check (unit in ('kg','g','liter','ml','piece'));

alter table purchase_invoices drop constraint if exists purchase_invoices_unit_check;
alter table purchase_invoices add constraint purchase_invoices_unit_check
  check (unit in ('kg','g','liter','ml','piece'));

alter table modifier_options drop constraint if exists modifier_options_stock_unit_check;
alter table modifier_options add constraint modifier_options_stock_unit_check
  check (stock_unit is null or stock_unit in ('kg','g','liter','ml','piece'));
reset lock_timeout;

-- ── كتلة 3: دالة التحويل الموحّدة ────────────────────────────────────────
-- ترجع الكمية p_qty (بوحدة p_from) معبّرًا عنها بوحدة تتبّع الصنف p_stock.
-- p_gpu = grams_per_unit للصنف (وزن الوحدة الواحدة بالغرام) — يُستخدم فقط
-- للجسر بين الوزن والحجم لصنف مُتتبَّع بالحجم (لتر/مل). أي حالة غير مغطّاة
-- ترجع p_qty كما هي — نفس ما يفعله «else» في المنطق القديم بالضبط.
create or replace function rka_to_base(p_qty numeric, p_from text, p_stock text, p_gpu numeric default null)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_qty is null then null
    when p_from = p_stock then p_qty
    -- عائلة الوزن
    when p_from in ('g','kg') and p_stock in ('g','kg')
      then p_qty * (case p_from  when 'kg' then 1000 else 1 end)
                 / (case p_stock when 'kg' then 1000 else 1 end)
    -- عائلة الحجم
    when p_from in ('ml','liter') and p_stock in ('ml','liter')
      then p_qty * (case p_from  when 'liter' then 1000 else 1 end)
                 / (case p_stock when 'liter' then 1000 else 1 end)
    -- صنف مُتتبَّع بالحجم، الوصفة مُدخَلة بالوزن → عبر الكثافة (غ لكل وحدة تتبّع)
    when p_stock in ('ml','liter') and p_from in ('g','kg') and p_gpu is not null and p_gpu > 0
      then (p_qty * (case p_from when 'kg' then 1000 else 1 end)) / p_gpu
    else p_qty
  end
$$;
revoke all on function rka_to_base(numeric, text, text, numeric) from public, anon;
grant execute on function rka_to_base(numeric, text, text, numeric) to authenticated;

-- ── كتلة 4: الخصم من المخزون عند البيع — نفس بنية 20260827150000 ─────────
create or replace function resolve_menu_item_recipe_decrements(p_menu_item_id bigint, p_line_qty numeric)
returns table (stock_item_id bigint, qty numeric)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  rec record;
begin
  for rec in select rl.stock_item_id, rl.qty as enc_qty, rl.unit,
                    si.unit as stock_unit, si.grams_per_unit as gpu
    from menu_item_recipe_lines rl join stock_items si on si.id = rl.stock_item_id
    where rl.menu_item_id = p_menu_item_id
  loop
    stock_item_id := rec.stock_item_id;
    qty := rka_to_base(decrypt_recipe_qty(rec.enc_qty), rec.unit, rec.stock_unit, rec.gpu) * p_line_qty;
    return next;
  end loop;
end;
$$;

-- ── كتلة 5: عرض تكلفة الصنف بلوحة التحكم — نفس بنية 20260829080000 ───────
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
      sum( rka_to_base(decrypt_recipe_qty(rl.qty), rl.unit, si.unit, si.grams_per_unit) * si.unit_cost ) as cost
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

-- ── كتلة 6: تكلفة سطر الطلب وقت البيع — نفس بنية 20260829140000 ─────────
create or replace function compute_line_cost(p_menu_item_id bigint, p_qty numeric, p_box_selections jsonb, p_unit_price numeric default null)
returns numeric
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_menu_item record;
  v_recipe_cost numeric := 0;
  v_box_cost numeric := 0;
  v_pieces_per_selection int;
  v_direct_cost numeric;
  sel jsonb;
  v_eligible record;
begin
  select * into v_menu_item from menu_items where id = p_menu_item_id;
  if v_menu_item is null then
    return 0;
  end if;

  select coalesce(sum(
    rka_to_base(decrypt_recipe_qty(rl.qty), rl.unit, si.unit, si.grams_per_unit) * si.unit_cost
  ), 0) into v_recipe_cost
  from menu_item_recipe_lines rl join stock_items si on si.id = rl.stock_item_id
  where rl.menu_item_id = p_menu_item_id;

  if v_menu_item.cost_mode = 'direct' then
    v_direct_cost := coalesce(v_menu_item.direct_cost, 0);
    if v_menu_item.direct_cost_large is not null and p_unit_price is not null
       and v_menu_item.price > 0 and p_unit_price > v_menu_item.price * 1.3 then
      v_direct_cost := v_menu_item.direct_cost_large;
    end if;
    return round(v_direct_cost * p_qty, 6);
  elsif v_menu_item.cost_mode = 'recipe' then
    return round(v_recipe_cost * p_qty, 6);
  elsif v_menu_item.cost_mode = 'box' then
    v_pieces_per_selection := coalesce(v_menu_item.box_pieces_per_selection, 1);
    for sel in select * from jsonb_array_elements(coalesce(p_box_selections, '[]'::jsonb)) loop
      select coalesce(si.unit_cost, e.extra_cost, 0) as piece_cost into v_eligible
        from menu_item_box_eligible_items e
        left join stock_items si on si.id = e.stock_item_id
        where e.id = nullif(sel->>'eligible_item_id','')::bigint and e.menu_item_id = p_menu_item_id;
      if found then
        v_box_cost := v_box_cost + (sel->>'qty')::numeric * v_pieces_per_selection * v_eligible.piece_cost;
      end if;
    end loop;
    return round((v_recipe_cost + v_box_cost + coalesce(v_menu_item.box_packaging_cost, 0)) * p_qty, 6);
  end if;
  return 0;
end;
$$;

-- ── كتلة 7: مدير المنتجات — set_menu_item_cost_guided يقبل 'ml' ويستخدم rka_to_base
-- (نفس بنية 20260909020000 مع تبديل حالة الوحدة + إضافة 'ml') ────────────────
create or replace function set_menu_item_cost_guided(
  p_menu_item_id bigint,
  p_mode text,
  p_direct_cost numeric default null,
  p_recipe_lines jsonb default null
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
      if coalesce(ln->>'unit','') not in ('kg','g','liter','ml','piece') then raise exception 'unit invalid'; end if;
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
      rka_to_base(decrypt_recipe_qty(rl.qty), rl.unit, si.unit, si.grams_per_unit) * si.unit_cost
    ), 0) into v_var
    from menu_item_recipe_lines rl join stock_items si on si.id = rl.stock_item_id
    where rl.menu_item_id = p_menu_item_id;
  end if;

  return jsonb_build_object('ok', true, 'variable_cost', round(coalesce(v_var, 0), 4));
end;
$$;
revoke all on function set_menu_item_cost_guided(bigint, text, numeric, jsonb) from public, anon;
grant execute on function set_menu_item_cost_guided(bigint, text, numeric, jsonb) to authenticated;

-- ── كتلة 8: مدير المخزون — create_stock_item_guided يقبل 'ml' + كثافة اختيارية
-- (نفس بنية 20260909030000، +'ml' +p_grams_per_unit). تُسقَط النسخة ذات الـ6
-- وسائط وتُستبدل بـ7 وسائط (السابع افتراضيّه null فالاستدعاء بلا كثافة يعمل). ──
drop function if exists create_stock_item_guided(text, text, text, text, numeric, numeric);
create or replace function create_stock_item_guided(
  p_op_id text,
  p_name text,
  p_category text,             -- 'raw' | 'packaging'
  p_unit text,                 -- 'kg' | 'g' | 'liter' | 'ml' | 'piece'
  p_unit_cost numeric,
  p_qty numeric,
  p_grams_per_unit numeric default null   -- وزن الوحدة الواحدة بالغرام (للتر/المل)
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
  v_gpu numeric := case when p_unit in ('liter','ml') and p_grams_per_unit is not null
                        and p_grams_per_unit > 0 and p_grams_per_unit <= 1000000
                        then p_grams_per_unit else null end;
  v_item_id bigint;
begin
  v_bid := current_business_id();
  if v_bid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_permission('screen:inventory') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_op_id is null or length(btrim(p_op_id)) < 8 or length(p_op_id) > 100 then raise exception 'bad op id'; end if;

  perform pg_advisory_xact_lock(hashtext('rka_stock_biz:' || v_bid::text));

  select stock_item_id into v_existing from stock_guided_ops where op_id = p_op_id;
  if v_existing is not null then
    return jsonb_build_object('stock_item_id', v_existing, 'created', false);
  end if;

  if v_name = '' then raise exception 'name required'; end if;
  if length(v_name) > 120 then raise exception 'name too long'; end if;
  if coalesce(p_category, '') not in ('raw', 'packaging') then raise exception 'bad category'; end if;
  if coalesce(p_unit, '') not in ('kg', 'g', 'liter', 'ml', 'piece') then raise exception 'bad unit'; end if;
  if p_unit_cost is null or p_unit_cost = 'NaN'::numeric or p_unit_cost < 0 or p_unit_cost > 1000000 then raise exception 'unit cost invalid'; end if;
  if p_qty is null or p_qty = 'NaN'::numeric or p_qty < 0 or p_qty > 1000000000 then raise exception 'qty invalid'; end if;

  if exists (
    select 1 from stock_items
    where business_id = v_bid and regexp_replace(btrim(name), '\s+', ' ', 'g') = v_name
  ) then
    raise exception 'duplicate stock item name';
  end if;

  insert into stock_items (business_id, name, category, unit, unit_cost, qty_on_hand, par_level, grams_per_unit)
  values (v_bid, v_name, p_category, p_unit, p_unit_cost, p_qty, p_qty, v_gpu)
  returning id into v_item_id;

  insert into stock_guided_ops (op_id, business_id, kind, stock_item_id)
  values (p_op_id, v_bid, 'stock_item', v_item_id);

  return jsonb_build_object(
    'stock_item_id', v_item_id, 'created', true,
    'name', v_name, 'category', p_category, 'unit', p_unit,
    'unit_cost', p_unit_cost, 'qty_on_hand', p_qty, 'par_level', p_qty,
    'grams_per_unit', v_gpu
  );
end;
$$;
revoke all on function create_stock_item_guided(text, text, text, text, numeric, numeric, numeric) from public, anon;
grant execute on function create_stock_item_guided(text, text, text, text, numeric, numeric, numeric) to authenticated;
