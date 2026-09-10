-- استهلاك تلقائي: أصناف تشغيل تُخصم من المخزون مع المبيعات دون أن تظهر
-- للكاشير أو في فاتورة العميل.
--
-- المشكلة: صنف مثل «فلتر قهوة» يُستهلك لكل دفعة تحضير (كل ٦ أكواب = فلتر)،
-- لا لكل كوب. ربطه بوصفة الإسبريسو ١:١ يخصم ٦ فلاتر مقابل ٦ أكواب.
--
-- الحل: قاعدة واحدة لكل صنف مخزون — «كل N مبيعة من [منتجات/فئات] اخصم
-- deduct_qty من الصنف». يُطبَّق عبر تريغر على order_items بعد الإدراج، فيغطّي
-- كل مسارات الطلب (كاشير فوري / صالة / أونلاين) بدون لمس دوال الدفع الكبيرة.
-- الكسر (deduct_qty / per_qty) يُخصم لكل قطعة مباعة، والباقي «يتراكم» طبيعيًا
-- لأن رصيد المخزون رقم عشري: بعد ٥ أكواب خُصم ٠٫٨٣ فلتر، والسادس يكمّله ١٫٠.
--
-- ملاحظات مقصودة:
--   • الاسترجاع لا يعيد أصناف الاستهلاك التلقائي (الفلتر استُهلك فعليًا وقت
--     التحضير) — نفس منطق الأصناف الاستهلاكية.
--   • تتبّع كمية فقط في هذه النسخة، لا يدخل في نسبة تكلفة الطعام.
--
-- كتل قابلة للتشغيل واحدة تلو الأخرى. الجدولان جديدان (سريع)، والتريغر
-- يأخذ قفلاً قصيرًا على order_items لذا set lock_timeout حوله.


-- ▓▓▓ كتلة ١ من ٦ — الجدولان ────────────────────────────────────────────────
create table if not exists indirect_consumption_rules (
  id            bigint generated always as identity primary key,
  business_id   bigint  not null references businesses(id)  on delete cascade,
  stock_item_id bigint  not null references stock_items(id) on delete cascade,
  per_qty       integer not null check (per_qty >= 1),
  deduct_qty    numeric not null default 1 check (deduct_qty > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, stock_item_id)
);
create index if not exists indirect_consumption_rules_business_idx on indirect_consumption_rules(business_id);
create index if not exists indirect_consumption_rules_stock_idx    on indirect_consumption_rules(stock_item_id);

create table if not exists indirect_consumption_rule_targets (
  id               bigint generated always as identity primary key,
  rule_id          bigint not null references indirect_consumption_rules(id) on delete cascade,
  menu_category_id bigint references menu_categories(id) on delete cascade,
  menu_item_id     bigint references menu_items(id)      on delete cascade,
  constraint one_target_kind check ((menu_category_id is not null) <> (menu_item_id is not null))
);
create index if not exists icr_targets_rule_idx     on indirect_consumption_rule_targets(rule_id);
create index if not exists icr_targets_item_idx     on indirect_consumption_rule_targets(menu_item_id);
create index if not exists icr_targets_category_idx on indirect_consumption_rule_targets(menu_category_id);


-- ▓▓▓ كتلة ٢ من ٦ — RLS (نفس نمط بقية جداول المخزون) ───────────────────────
alter table indirect_consumption_rules enable row level security;
drop policy if exists indirect_consumption_rules_all on indirect_consumption_rules;
create policy indirect_consumption_rules_all on indirect_consumption_rules for all
  using      (business_id = current_business_id() and has_permission('screen:inventory'))
  with check (business_id = current_business_id() and has_permission('screen:inventory'));

alter table indirect_consumption_rule_targets enable row level security;
drop policy if exists indirect_consumption_rule_targets_all on indirect_consumption_rule_targets;
create policy indirect_consumption_rule_targets_all on indirect_consumption_rule_targets for all
  using (exists (
    select 1 from indirect_consumption_rules r
    where r.id = indirect_consumption_rule_targets.rule_id
      and r.business_id = current_business_id() and has_permission('screen:inventory')
  ))
  with check (exists (
    select 1 from indirect_consumption_rules r
    where r.id = indirect_consumption_rule_targets.rule_id
      and r.business_id = current_business_id() and has_permission('screen:inventory')
  ));


-- ▓▓▓ كتلة ٣ من ٦ — دالة التريغر ───────────────────────────────────────────
create or replace function apply_indirect_consumption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id  bigint;
  v_category_id  bigint;
  r              record;
begin
  if new.menu_item_id is null then
    return new;
  end if;

  select o.business_id, mi.category_id
    into v_business_id, v_category_id
  from orders o
  join menu_items mi on mi.id = new.menu_item_id
  where o.id = new.order_id;

  if v_business_id is null then
    return new;
  end if;

  for r in
    select icr.stock_item_id,
           (icr.deduct_qty / icr.per_qty::numeric) * new.qty as dec_qty
    from indirect_consumption_rules icr
    where icr.business_id = v_business_id
      and exists (
        select 1 from indirect_consumption_rule_targets t
        where t.rule_id = icr.id
          and ( t.menu_item_id = new.menu_item_id
             or (v_category_id is not null and t.menu_category_id = v_category_id) )
      )
  loop
    update stock_items
       set qty_on_hand = qty_on_hand - r.dec_qty, updated_at = now()
     where id = r.stock_item_id and business_id = v_business_id;
  end loop;

  return new;
end;
$$;


-- ▓▓▓ كتلة ٤ من ٦ — ربط التريغر بجدول order_items ─────────────────────────
set lock_timeout = '5s';
drop trigger if exists trg_apply_indirect_consumption on order_items;
create trigger trg_apply_indirect_consumption
  after insert on order_items
  for each row execute function apply_indirect_consumption();
reset lock_timeout;


-- ▓▓▓ كتلة ٥ من ٦ — RPC لحفظ/مسح قاعدة صنف واحد (استبدال كامل ذرّي) ─────────
create or replace function set_indirect_consumption(
  p_stock_item_id bigint,
  p_per_qty       integer,
  p_deduct_qty    numeric,
  p_category_ids  bigint[],
  p_menu_item_ids bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid     bigint := current_business_id();
  v_rule_id bigint;
  v_cat     bigint;
  v_item    bigint;
begin
  if not has_permission('screen:inventory') then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from stock_items where id = p_stock_item_id and business_id = v_bid) then
    raise exception 'stock item not in business';
  end if;

  -- استبدال كامل: احذف القاعدة القائمة (يسقط أهدافها بالـcascade)
  delete from indirect_consumption_rules
   where business_id = v_bid and stock_item_id = p_stock_item_id;

  -- per_qty فارغ / أقل من ١ أو بلا أهداف ⇒ إزالة فقط
  if p_per_qty is null or p_per_qty < 1
     or ( coalesce(array_length(p_category_ids, 1), 0) = 0
      and coalesce(array_length(p_menu_item_ids, 1), 0) = 0 ) then
    return null;
  end if;

  insert into indirect_consumption_rules (business_id, stock_item_id, per_qty, deduct_qty)
  values (v_bid, p_stock_item_id, p_per_qty,
          case when p_deduct_qty is null or p_deduct_qty <= 0 then 1 else p_deduct_qty end)
  returning id into v_rule_id;

  foreach v_cat in array coalesce(p_category_ids, '{}'::bigint[]) loop
    if exists (select 1 from menu_categories where id = v_cat and business_id = v_bid) then
      insert into indirect_consumption_rule_targets (rule_id, menu_category_id) values (v_rule_id, v_cat);
    end if;
  end loop;

  foreach v_item in array coalesce(p_menu_item_ids, '{}'::bigint[]) loop
    if exists (select 1 from menu_items where id = v_item and business_id = v_bid) then
      insert into indirect_consumption_rule_targets (rule_id, menu_item_id) values (v_rule_id, v_item);
    end if;
  end loop;

  return v_rule_id;
end;
$$;


-- ▓▓▓ كتلة ٦ من ٦ — الصلاحيات ──────────────────────────────────────────────
revoke all on function set_indirect_consumption(bigint, integer, numeric, bigint[], bigint[]) from public, anon;
grant execute on function set_indirect_consumption(bigint, integer, numeric, bigint[], bigint[]) to authenticated;
-- دالة التريغر يستدعيها التريغر نفسه، لا تُنادى مباشرة — لا حاجة لمنحها.
revoke all on function apply_indirect_consumption() from public, anon;


-- ═══════════════════════════════════════════════════════════════════════════
--  تحقّق سريع (اختياري):
--    select r.per_qty, r.deduct_qty, si.name as consumable,
--           coalesce(mc.name, mi.name) as target,
--           case when t.menu_category_id is not null then 'فئة' else 'منتج' end as kind
--    from indirect_consumption_rules r
--    join stock_items si on si.id = r.stock_item_id
--    join indirect_consumption_rule_targets t on t.rule_id = r.id
--    left join menu_categories mc on mc.id = t.menu_category_id
--    left join menu_items mi on mi.id = t.menu_item_id;
-- ═══════════════════════════════════════════════════════════════════════════
