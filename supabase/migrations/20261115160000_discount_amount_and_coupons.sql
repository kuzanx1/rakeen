-- الخصم بمبلغ ثابت + الكوبونات.
--
-- ١) «خصومات جاهزة» صارت تقبل مبلغ (١٠ ريال من الفاتورة) بدل النسبة.
--    الطلب نفسه ما تغيّر: discount_pct = ٠ و discount_amount = المبلغ.
--    الكاشير يرسل الاثنين من قبل (complete_pos_order)، فما يحتاج دالة جديدة.
--    طلب الطاولة (register_dine_in_order) يبقى بالنسبة: الخادم يحسب خصمه
--    من النسبة كل ما انضافت جولة.
--
-- ٢) الكوبونات: كود يكتبه العميل بالمتجر أو يعطيه للكاشير.
--    - المتجر: الطلب يتسجّل كالعادة (submit_online_order ما تغيّرت)، وبعده
--      مباشرة apply_order_coupon ينزّل الخصم ويعيد حساب الضريبة والإجمالي،
--      قبل صفحة الدفع. ملكية الطلب = tracking_token.
--    - الكاشير: check_coupon يرجّع الخصم، ويطبّقه الكاشير خصماً عادياً
--      سببه «كوبون CODE».
--    - الاستخدام ينعدّ من مكان واحد: trigger على الطلبات يقرأ «كوبون CODE»
--      من discount_reason (يمرّ عليه طلب الكاشير بلا نت لما يوصل، وطلب
--      المتجر). فعدّاد الاستخدام ما يفترق بين العميلين.
--
-- التطبيق: react-native-poc/src/application/couponService.ts
-- الويب:    rkCheckCoupon في public/pos/rakeen-pos.js، والمتجر rakeen-order.js
-- اللوحة:   الإعدادات ← الكاشير ← «الخصومات والكوبونات»

set lock_timeout = '5s';

-- ---------- ١) قوالب الخصم بالمبلغ ----------
alter table public.discount_presets add column if not exists amount numeric;
alter table public.discount_presets alter column pct drop not null;
do $do$
declare c text;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.discount_presets'::regclass and contype = 'c'
  loop
    execute format('alter table public.discount_presets drop constraint %I', c);
  end loop;
end
$do$;
alter table public.discount_presets add constraint discount_presets_value_ck check (
  (pct is not null and pct > 0 and pct <= 100 and amount is null)
  or (pct is null and amount is not null and amount > 0)
);

-- ---------- ٢) الكوبونات ----------
create table if not exists public.coupons (
  id          bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  code        text not null check (code ~ '^[A-Z0-9_-]{3,20}$'),
  kind        text not null check (kind in ('pct', 'amount')),
  pct         numeric check (pct is null or (pct > 0 and pct <= 100)),
  amount      numeric check (amount is null or amount > 0),
  min_order   numeric not null default 0 check (min_order >= 0),
  max_uses    int check (max_uses is null or max_uses > 0),
  uses_count  int not null default 0,
  expires_at  timestamptz,
  for_store   boolean not null default true,
  for_pos     boolean not null default true,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint coupons_value_ck check ((kind = 'pct' and pct is not null) or (kind = 'amount' and amount is not null)),
  constraint coupons_where_ck check (for_store or for_pos)
);
create unique index if not exists coupons_business_code_key on public.coupons (business_id, code);

alter table public.coupons enable row level security;
drop policy if exists coupons_select on public.coupons;
create policy coupons_select on public.coupons for select
  using (business_id = current_business_id());
drop policy if exists coupons_write on public.coupons;
create policy coupons_write on public.coupons for all
  using (business_id = current_business_id() and has_permission('screen:settings'))
  with check (business_id = current_business_id() and has_permission('screen:settings'));
revoke all on public.coupons from anon;

create table if not exists public.coupon_redemptions (
  id           bigint generated always as identity primary key,
  coupon_id    bigint not null references public.coupons(id) on delete cascade,
  business_id  bigint not null references public.businesses(id) on delete cascade,
  order_id     bigint not null unique references public.orders(id) on delete cascade,
  discount_amount numeric not null default 0,
  source       text,
  created_at   timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, created_at desc);
alter table public.coupon_redemptions enable row level security;
drop policy if exists coupon_redemptions_select on public.coupon_redemptions;
create policy coupon_redemptions_select on public.coupon_redemptions for select
  using (business_id = current_business_id());
revoke all on public.coupon_redemptions from anon;
revoke insert, update, delete on public.coupon_redemptions from authenticated;

-- الكوبون صالح؟ يرجّع الخصم على هالمجموع، أو سبب الرفض بكلام العميل.
create or replace function public.rk_coupon_quote(p_business_id bigint, p_code text, p_subtotal numeric, p_where text)
returns table (r_ok boolean, r_reason text, r_coupon_id bigint, r_code text, r_kind text, r_pct numeric, r_amount numeric, r_discount numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  c coupons%rowtype;
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
  r_discount := case when c.kind = 'pct' then round(coalesce(p_subtotal, 0) * c.pct / 100, 2)
                     else least(c.amount, coalesce(p_subtotal, 0)) end;
  r_ok := true;
  return next;
end
$fn$;
revoke all on function public.rk_coupon_quote(bigint, text, numeric, text) from public, anon, authenticated;

-- الكاشير: يتحقق قبل ما يطبّق.
create or replace function public.check_coupon(p_code text, p_subtotal numeric)
returns table (r_ok boolean, r_reason text, r_code text, r_kind text, r_pct numeric, r_amount numeric, r_discount numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  return query
    select q.r_ok, q.r_reason, q.r_code, q.r_kind, q.r_pct, q.r_amount, q.r_discount
      from rk_coupon_quote(current_business_id(), p_code, p_subtotal, 'pos') q;
end
$fn$;
revoke all on function public.check_coupon(text, numeric) from public, anon;
grant execute on function public.check_coupon(text, numeric) to authenticated;

-- المتجر: معاينة الخصم قبل الإرسال.
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
revoke all on function public.check_store_coupon(text, text, numeric) from public;
grant execute on function public.check_store_coupon(text, text, numeric) to anon, authenticated;

-- المتجر: خانة «عندك كوبون؟» تطلع بس لمطعم عنده كوبون شغّال للمتجر --
-- لا تحرّج عميل مطعم ما سوّى كوبونات. (ما يكشف الأكواد، بس نعم/لا.)
create or replace function public.store_has_coupons(p_business_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from coupons c join businesses b on b.id = c.business_id
     where b.online_menu_slug = p_business_slug and b.online_ordering_enabled = true
       and c.active and c.for_store
       and (c.expires_at is null or c.expires_at > now())
       and (c.max_uses is null or c.uses_count < c.max_uses)
  );
$fn$;
revoke all on function public.store_has_coupons(text) from public;
grant execute on function public.store_has_coupons(text) to anon, authenticated;

-- المتجر: بعد submit_online_order مباشرة، قبل صفحة الدفع. مرة وحدة للطلب.
create or replace function public.apply_order_coupon(p_order_id bigint, p_tracking_token text, p_code text)
returns table (r_ok boolean, r_reason text, r_discount numeric, r_total numeric)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  o orders%rowtype;
  b businesses%rowtype;
  q record;
  v_rate numeric;
  v_new_vat numeric; v_new_charged numeric;
begin
  select * into o from orders where id = p_order_id and tracking_token::text = p_tracking_token for update;
  if o.id is null or o.source <> 'online' then
    r_ok := false; r_reason := 'الطلب مو موجود'; return next; return;
  end if;
  if o.discount_reason is not null and o.discount_reason like 'كوبون %' then
    r_ok := true; r_discount := o.discount_amount; r_total := o.total; return next; return; -- طُبّق قبل
  end if;
  if o.created_at < now() - interval '30 minutes' or coalesce(o.discount_amount, 0) > 0
     or o.payment_status = 'paid' then
    r_ok := false; r_reason := 'ما يمدي نطبّق كوبون على هالطلب'; return next; return;
  end if;
  select * into q from rk_coupon_quote(o.business_id, p_code, o.subtotal, 'store');
  if not q.r_ok then
    r_ok := false; r_reason := q.r_reason; return next; return;
  end if;
  select * into b from businesses where id = o.business_id;
  v_rate := case when coalesce(b.vat_registered, true) then coalesce(b.vat_rate, 0.15) else 0 end;
  -- نفس معادلة submit_online_order بالضبط (الأصناف + التوصيل)، بعد الخصم.
  select s.vat_amount, s.charged_amount into v_new_vat, v_new_charged
    from compute_vat_split(o.subtotal - q.r_discount + coalesce(o.delivery_fee, 0), v_rate, coalesce(b.prices_include_vat, true)) s;
  update orders
     set discount_pct = case when q.r_kind = 'pct' then q.r_pct else 0 end,
         discount_amount = q.r_discount,
         discount_reason = 'كوبون ' || q.r_code,
         vat_amount = v_new_vat,
         total = v_new_charged
   where id = o.id
  returning total into r_total;
  r_ok := true; r_discount := q.r_discount;
  return next;
end
$fn$;
revoke all on function public.apply_order_coupon(bigint, text, text) from public;
grant execute on function public.apply_order_coupon(bigint, text, text) to anon, authenticated;

-- عدّاد الاستخدام: من مكان واحد لكل الطلبات.
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
     and c.code = upper(trim(substr(new.discount_reason, length('كوبون ') + 1)));
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
drop trigger if exists zz_orders_record_coupon on public.orders;
create trigger zz_orders_record_coupon
  after insert or update of discount_reason on public.orders
  for each row execute function public.rk_orders_record_coupon();
