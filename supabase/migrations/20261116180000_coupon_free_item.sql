-- كوبون «منتج مجاني»: الكاشير يكتب الكود، والمنتج ينضاف للسلة ومجاني.
--
-- صاحب المحل: «عندي منتج معين أربطه بكوبون، يحط الكوبون المنتج يجي بالسلة
-- لحاله ومجاني… ولازم يتسجل إنه طلع مجاني بالوردية أو بالتقارير».
--
-- كيف: كوبون kind = 'item' مربوط بـ menu_item_id. check_coupon يرجّع المنتج
-- وسعره، والكاشير يضيفه للسلة ويخصم سعره خصماً عادياً سببه
-- «كوبون CODE · هدية: اسم المنتج». فيطلع بالخصومات بورقة الموازنة وبالتقارير
-- باسمه، والعدّاد ينعدّ من نفس الـ trigger (يقرأ الكود لين أول مسافة).
--
-- للكاشير بس (المتجر يطبّق الكوبون بعد ما ينرسل الطلب، فما يقدر يضيف منتج).
-- الأجهزة القديمة ما تعرف 'item': check_coupon يرفضه لها إلا لو أرسلت
-- p_items_ok = true، وإلا كانت بتطبّق خصم صفر وتعدّ استخدام.
--
-- التطبيق: couponService.ts + DiscountModal.tsx · الويب: rkCheckCoupon
-- اللوحة:  الإعدادات ← الكاشير ← «الخصومات والكوبونات» ← «منتج مجاني»

begin;
set local lock_timeout = '5s';

alter table public.coupons add column if not exists menu_item_id bigint references public.menu_items(id) on delete set null;

do $do$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.coupons'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.coupons drop constraint %I', c);
  end loop;
end
$do$;
alter table public.coupons add constraint coupons_kind_check check (kind in ('pct', 'amount', 'item'));
alter table public.coupons drop constraint if exists coupons_value_ck;
alter table public.coupons add constraint coupons_value_ck check (
  (kind = 'pct' and pct is not null)
  or (kind = 'amount' and amount is not null)
  or (kind = 'item')
);
-- منتج مجاني = للكاشير بس.
alter table public.coupons drop constraint if exists coupons_item_pos_ck;
alter table public.coupons add constraint coupons_item_pos_ck check (kind <> 'item' or (for_pos and not for_store));
-- المنتج من نفس المنشأة.
create or replace function public.rk_coupon_item_same_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.menu_item_id is not null
     and not exists (select 1 from menu_items m where m.id = new.menu_item_id and m.business_id = new.business_id) then
    raise exception 'المنتج مو من محلك';
  end if;
  if new.kind = 'item' and new.menu_item_id is null and (tg_op = 'INSERT' or old.kind <> 'item') then
    raise exception 'اختر المنتج المجاني';
  end if;
  return new;
end
$fn$;
drop trigger if exists rk_coupon_item_same_business on public.coupons;
create trigger rk_coupon_item_same_business
  before insert or update on public.coupons
  for each row execute function public.rk_coupon_item_same_business();

-- الحساب نفسه + المنتج (r_item_id، r_item_name). منتج مجاني: الخصم = سعره.
drop function if exists public.rk_coupon_quote(bigint, text, numeric, text);
create function public.rk_coupon_quote(p_business_id bigint, p_code text, p_subtotal numeric, p_where text)
returns table (r_ok boolean, r_reason text, r_coupon_id bigint, r_code text, r_kind text, r_pct numeric, r_amount numeric, r_discount numeric, r_item_id bigint, r_item_name text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  c coupons%rowtype;
  m record;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  r_code := v_code;
  select * into c from coupons x where x.business_id = p_business_id and x.code = v_code;
  if c.id is null or not c.active then
    r_ok := false; r_reason := 'الكوبون غير صحيح'; return next; return;
  end if;
  r_coupon_id := c.id; r_kind := c.kind; r_pct := c.pct; r_amount := c.amount;
  if c.expires_at is not null and c.expires_at < now() then
    r_ok := false; r_reason := 'الكوبون انتهى'; return next; return;
  end if;
  if (p_where = 'store' and not c.for_store) or (p_where = 'pos' and not c.for_pos) then
    r_ok := false;
    r_reason := case when p_where = 'store' then 'هالكوبون للطلب من المحل بس' else 'هالكوبون للمتجر الإلكتروني بس' end;
    return next; return;
  end if;
  if c.max_uses is not null and c.uses_count >= c.max_uses then
    r_ok := false; r_reason := 'الكوبون خلص'; return next; return;
  end if;
  if coalesce(p_subtotal, 0) < c.min_order then
    r_ok := false; r_reason := 'الكوبون لطلب من ' || trim(to_char(c.min_order, 'FM999999990.##')) || ' ريال وفوق'; return next; return;
  end if;
  if c.kind = 'item' then
    select mi.id, mi.name, mi.price into m
      from menu_items mi
     where mi.id = c.menu_item_id and mi.business_id = p_business_id and mi.active;
    if m.id is null then
      r_ok := false; r_reason := 'المنتج حق الكوبون مو متوفر'; return next; return;
    end if;
    r_item_id := m.id; r_item_name := m.name;
    r_amount := m.price; r_discount := m.price;
    r_ok := true;
    return next; return;
  end if;
  r_discount := case when c.kind = 'pct' then round(coalesce(p_subtotal, 0) * c.pct / 100, 2)
                     else least(c.amount, coalesce(p_subtotal, 0)) end;
  r_ok := true;
  return next;
end
$fn$;
revoke all on function public.rk_coupon_quote(bigint, text, numeric, text) from public, anon, authenticated;

-- الكاشير. p_items_ok: الجهاز يعرف يضيف المنتج المجاني (1.26 والويب).
drop function if exists public.check_coupon(text, numeric);
drop function if exists public.check_coupon(text, numeric, boolean);
create function public.check_coupon(p_code text, p_subtotal numeric, p_items_ok boolean default false)
returns table (r_ok boolean, r_reason text, r_code text, r_kind text, r_pct numeric, r_amount numeric, r_discount numeric, r_item_id bigint, r_item_name text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  q record;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  select * into q from rk_coupon_quote(current_business_id(), p_code, p_subtotal, 'pos');
  if q.r_ok and q.r_kind = 'item' and not coalesce(p_items_ok, false) then
    r_ok := false; r_reason := 'حدّث تطبيق الكاشير عشان تستخدم هالكوبون'; r_code := q.r_code;
    return next; return;
  end if;
  r_ok := q.r_ok; r_reason := q.r_reason; r_code := q.r_code; r_kind := q.r_kind; r_pct := q.r_pct;
  r_amount := q.r_amount; r_discount := q.r_discount; r_item_id := q.r_item_id; r_item_name := q.r_item_name;
  return next;
end
$fn$;
revoke all on function public.check_coupon(text, numeric, boolean) from public, anon;
grant execute on function public.check_coupon(text, numeric, boolean) to authenticated;

-- المتجر: نفس الشي، بالأعمدة القديمة (المنتج المجاني يرجع «للمحل بس»).
create or replace function public.check_store_coupon(p_business_slug text, p_code text, p_subtotal numeric)
returns table (r_ok boolean, r_reason text, r_code text, r_kind text, r_pct numeric, r_amount numeric, r_discount numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_business bigint;
begin
  select b.id into v_business from businesses b where b.online_menu_slug = p_business_slug and b.online_ordering_enabled = true;
  if v_business is null then
    r_ok := false; r_reason := 'المتجر مو متاح'; return next; return;
  end if;
  return query
    select q.r_ok, q.r_reason, q.r_code, q.r_kind, q.r_pct, q.r_amount, q.r_discount
      from rk_coupon_quote(v_business, p_code, p_subtotal, 'store') q;
end
$fn$;

-- العدّاد: الكود لين أول مسافة («كوبون CODE · هدية: …»).
create or replace function public.rk_orders_record_coupon()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_coupon bigint;
begin
  if new.discount_reason is null or new.discount_reason not like 'كوبون %' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.discount_reason is not distinct from new.discount_reason then
    return new;
  end if;
  select c.id into v_coupon from coupons c
   where c.business_id = new.business_id
     and c.code = upper(split_part(trim(substr(new.discount_reason, length('كوبون ') + 1)), ' ', 1));
  if v_coupon is null then
    return new;
  end if;
  insert into coupon_redemptions (coupon_id, business_id, order_id, discount_amount, source)
  values (v_coupon, new.business_id, new.id, coalesce(new.discount_amount, 0), new.source)
  on conflict (order_id) do nothing;
  if found then
    update coupons set uses_count = uses_count + 1 where id = v_coupon;
  end if;
  return new;
end
$fn$;

commit;
