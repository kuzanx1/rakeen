-- أرقام طلبات محجوزة لكل جهاز: الفاتورة تنطبع برقمها النهائي فوراً.
--
-- كانت الفاتورة تنتظر complete_pos_order لين ٣٫٥ ثانية عشان تعرف رقم
-- الطلب (orders.id). الآن الجهاز يحجز مقدماً دفعة أرقام، كل رقم مربوط
-- بـ client_order_uuid ولّده الجهاز. لما يوصل الطلب، الـ trigger يحط
-- الرقم المحجوز في orders.id بدل رقم التسلسل.
--
-- ما تغيّر complete_pos_order ولا register_dine_in_order ولا أي دالة:
-- الطلب اللي ما له حجز (نسخة قديمة، طلب إلكتروني، طاولة) ياخذ رقمه من
-- التسلسل مثل قبل. والأرقام نفسها من نفس التسلسل، فما تتكرر أبداً.
--
-- التطبيق: react-native-poc/src/application/orderNumberPool.ts
-- الويب:    rkOrderNumberPool في public/pos/rakeen-pos.js

create table if not exists public.order_id_reservations (
  id bigint primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  branch_id bigint not null references public.branches(id) on delete cascade,
  client_order_uuid uuid not null unique,
  reserved_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists order_id_reservations_open_by_branch
  on public.order_id_reservations (branch_id) where used_at is null;

-- تشغيل لكل منشأة. نسخ التطبيق القديمة (قبل 1.16) فيها «جهاز الطباعة»
-- يتابع الطلبات بـ id > آخر رقم، فرقم محجوز أقدم يوصل بعد أحدث ما ينطبع
-- عندها. فالميزة ما تشتغل إلا لمنشأة مضافة هنا، لين تتحدّث كل الأجهزة.
create table if not exists public.order_number_blocks_enabled (
  business_id bigint primary key references public.businesses(id) on delete cascade,
  enabled_at timestamptz not null default now()
);
alter table public.order_number_blocks_enabled enable row level security;
revoke all on public.order_number_blocks_enabled from anon, authenticated;

-- لا أحد يقرأها أو يكتب فيها مباشرة: الدالتان تحت فقط.
alter table public.order_id_reservations enable row level security;
revoke all on public.order_id_reservations from anon, authenticated;

-- يحجز رقماً لكل uuid. نداء معاد بنفس الـ uuid يرجّع نفس الرقم.
create or replace function public.reserve_order_ids(p_branch_id bigint, p_uuids uuid[])
returns table (r_order_id bigint, r_client_order_uuid uuid)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_business bigint := current_business_id();
  v_seq text := pg_get_serial_sequence('public.orders', 'id');
  v_n int := coalesce(array_length(p_uuids, 1), 0);
  v_open int;
  v_id bigint;
  u uuid;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from branches b where b.id = p_branch_id and b.business_id = v_business) then
    raise exception 'branch not found';
  end if;
  if v_n < 1 or v_n > 100 then
    raise exception 'between 1 and 100 numbers per call';
  end if;
  -- المنشأة ما تفعّلت: ولا رقم. الجهاز يبيع بالمسار القديم.
  if not exists (select 1 from order_number_blocks_enabled e where e.business_id = v_business) then
    return;
  end if;

  -- تنظيف: المستخدم بعد أسبوع، واليتيم (جهاز انمسح) بعد ٤٠ يوم.
  delete from order_id_reservations x
   where x.branch_id = p_branch_id
     and ((x.used_at is not null and x.used_at < now() - interval '7 days')
       or (x.used_at is null and x.reserved_at < now() - interval '40 days'));

  select count(*) into v_open from order_id_reservations x
   where x.branch_id = p_branch_id and x.used_at is null;
  if v_open + v_n > 2000 then
    raise exception 'too many open reservations';
  end if;

  foreach u in array p_uuids loop
    v_id := null;
    select x.id into v_id from order_id_reservations x
     where x.client_order_uuid = u and x.branch_id = p_branch_id;
    if v_id is null then
      -- uuid صار له طلب أصلاً؟ ما يحتاج رقم.
      continue when exists (select 1 from orders o where o.client_order_uuid = u);
      v_id := nextval(v_seq);
      insert into order_id_reservations (id, business_id, branch_id, client_order_uuid)
      values (v_id, v_business, p_branch_id, u);
    end if;
    r_order_id := v_id;
    r_client_order_uuid := u;
    return next;
  end loop;
end
$fn$;

revoke all on function public.reserve_order_ids(bigint, uuid[]) from public, anon;
grant execute on function public.reserve_order_ids(bigint, uuid[]) to authenticated;

-- الطلب اللي uuid حقه محجوز ياخذ رقمه المحجوز. غيره ما يتغيّر.
-- لو فشل الإدخال بعدها، الـ update يتراجع معه فيبقى الرقم متاحاً لإعادة المحاولة.
create or replace function public.orders_take_reserved_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id bigint;
begin
  if new.client_order_uuid is null then
    return new;
  end if;
  update order_id_reservations x
     set used_at = now()
   where x.client_order_uuid = new.client_order_uuid
     and x.used_at is null
     and x.business_id = new.business_id
     and x.branch_id = new.branch_id
  returning x.id into v_id;
  if v_id is not null then
    new.id := v_id;
  end if;
  return new;
end
$fn$;

drop trigger if exists aaa_orders_take_reserved_id on public.orders;
create trigger aaa_orders_take_reserved_id
  before insert on public.orders
  for each row execute function public.orders_take_reserved_id();
