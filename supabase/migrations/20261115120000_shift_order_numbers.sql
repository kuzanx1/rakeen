-- رقم الطلب يرجع ١ مع كل وردية جديدة، ولكل فرع عدّاده.
--
-- قبل: عدّاد واحد للمنشأة يكمل للأبد (20261114180000_business_order_numbers).
-- صاحب المحل: «الفاتورة والبيجر يتصفرون يومياً، هذا المفروض في أي مطعم».
-- والقرار: يرجع ١ مع فتح أول وردية بعد ما تقفلت كل الورديات، ولكل فرع لحاله.
--
-- للفرع وردية مفتوحة وحدة بس (فهرس فريد قائم)، فـ«أول وردية بعد الإقفال»
-- = كل وردية جديدة. فالسلسلة (series) = id آخر وردية فُتحت بالفرع، والعدّاد
-- يرجع صفر بنفسه أول ما ياخذ رقم بعد ما تتغيّر -- بلا trigger على الورديات،
-- وبلا مؤقّت.
--
-- الرقم يتكرر الحين (كل وردية فيها #1)، فالفريد صار (الفرع، السلسلة، الرقم).
-- والفاتورة الضريبية تحتاج رقم ما يتكرر: تنطبع «رقم الفاتورة» = orders.id
-- (الرقم الداخلي) سطراً صغيراً، ورقم الطلب الكبير هو اللي يتصفّر.
--
-- الأجهزة تحجز أرقام مسبقاً (orderNumberPool): كل حجز يحمل سلسلته، والجهاز
-- يرمي ما ليس من وردية فرعه الحالية، والخادم يحذف غير المستخدم من سلسلة قديمة.
--
-- التطبيق: react-native-poc/src/application/orderNumberPool.ts
-- الويب:    rkOrderNumberPool في public/pos/rakeen-pos.js

set lock_timeout = '5s';

create index if not exists shifts_branch_id_id_idx on public.shifts (branch_id, id desc);

-- السلسلة الحالية للفرع: آخر وردية فُتحت فيه (٠ = ما فُتحت وردية أبداً).
create or replace function public.rk_branch_order_series(p_branch_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(max(s.id), 0) from shifts s where s.branch_id = p_branch_id;
$fn$;
revoke all on function public.rk_branch_order_series(bigint) from public, anon, authenticated;

-- ---------- العدّاد ----------
create table if not exists public.branch_order_counters (
  branch_id bigint primary key references public.branches(id) on delete cascade,
  series bigint not null,
  last_no bigint not null default 0
);
alter table public.branch_order_counters enable row level security;
revoke all on public.branch_order_counters from anon, authenticated;

-- n رقم متتالي من عدّاد الفرع. سلسلة أحدث = يبدأ من ١. سلسلة أقدم (قُرئت
-- قبل لحظة من فتح وردية) ما ترجّع العدّاد للوراء: تاخذ من الأحدث.
create or replace function public.take_branch_order_nos(p_branch_id bigint, p_n int, out r_first bigint, out r_series bigint)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_series bigint := rk_branch_order_series(p_branch_id);
  v_last bigint;
begin
  insert into branch_order_counters as c (branch_id, series, last_no)
  values (p_branch_id, v_series, p_n)
  on conflict (branch_id) do update set
    last_no = case when excluded.series > c.series then p_n else c.last_no + p_n end,
    series = greatest(c.series, excluded.series)
  returning c.last_no, c.series into v_last, r_series;
  r_first := v_last - p_n + 1;
end
$fn$;
revoke all on function public.take_branch_order_nos(bigint, int) from public, anon, authenticated;

-- ---------- الطلبات ----------
alter table public.orders add column if not exists order_series bigint;
drop index if exists public.orders_business_order_no_key;
create unique index if not exists orders_branch_series_order_no_key
  on public.orders (branch_id, order_series, order_no)
  where order_no is not null and order_series is not null;

-- ---------- الحجوزات ----------
alter table public.order_no_reservations add column if not exists series bigint;
update public.order_no_reservations x
   set series = rk_branch_order_series(x.branch_id)
 where x.series is null;
alter table public.order_no_reservations alter column series set not null;
alter table public.order_no_reservations drop constraint if exists order_no_reservations_pkey;
create unique index if not exists order_no_reservations_branch_series_no_key
  on public.order_no_reservations (branch_id, series, order_no);

-- البداية: كل فرع يكمل من رقمه الحالي لين وردية جديدة، فما يرجع ١ وسط
-- وردية مفتوحة ولا يتكرر رقم محجوز بجهاز.
insert into public.branch_order_counters (branch_id, series, last_no)
select b.id,
       rk_branch_order_series(b.id),
       greatest(
         coalesce((select max(o.order_no) from orders o where o.branch_id = b.id and o.order_no is not null), 0),
         coalesce((select max(x.order_no) from order_no_reservations x where x.branch_id = b.id), 0))
  from branches b
 where exists (select 1 from order_number_blocks_enabled e where e.business_id = b.business_id)
on conflict (branch_id) do nothing;

-- ---------- الحجز ----------
-- مثل قبل، و r_series زيادة: الجهاز يرمي أي رقم من وردية غير ورديته.
drop function if exists public.reserve_order_numbers(bigint, uuid[]);
create function public.reserve_order_numbers(p_branch_id bigint, p_uuids uuid[])
returns table (r_order_no bigint, r_order_id bigint, r_client_order_uuid uuid, r_series bigint)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_business bigint := current_business_id();
  v_n int := coalesce(array_length(p_uuids, 1), 0);
  v_series bigint;
  v_open int;
  v_new uuid[] := '{}';
  v_first bigint;
  v_no bigint;
  v_id bigint;
  v_s bigint;
  v_seq text := pg_get_serial_sequence('public.orders', 'id');
  u uuid;
  i int := 0;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from branches b where b.id = p_branch_id and b.business_id = v_business) then
    raise exception 'branch not found';
  end if;
  if v_n < 1 or v_n > 50 then
    raise exception 'between 1 and 50 numbers per call';
  end if;
  if not exists (select 1 from order_number_blocks_enabled e where e.business_id = v_business) then
    return;
  end if;
  v_series := rk_branch_order_series(p_branch_id);

  -- تنظيف: غير المستخدم من وردية سابقة بعد يومين (جهاز بنسخة قديمة يطبع
  -- رقمه المحجوز، فيبقى له لين يرتفع طلبه بنفس الرقم)، والمستخدم بعد أسبوع.
  delete from order_no_reservations x
   where x.branch_id = p_branch_id
     and ((x.used_at is null and x.series < v_series and x.reserved_at < now() - interval '2 days')
       or (x.used_at is not null and x.used_at < now() - interval '7 days')
       or (x.used_at is null and x.reserved_at < now() - interval '40 days'));

  -- الحد على الوردية الحالية بس: بواقي الورديات السابقة ما تسدّ الحجز.
  select count(*) into v_open from order_no_reservations x
   where x.branch_id = p_branch_id and x.used_at is null and x.series = v_series;
  if v_open + v_n > 500 then
    raise exception 'too many open reservations';
  end if;

  foreach u in array p_uuids loop
    v_no := null;
    select x.order_no, x.order_id, x.series into v_no, v_id, v_s from order_no_reservations x
     where x.client_order_uuid = u and x.business_id = v_business;
    if v_no is not null then
      r_order_no := v_no;
      r_order_id := v_id;
      r_client_order_uuid := u;
      r_series := v_s;
      return next;
    elsif not exists (select 1 from orders o where o.client_order_uuid = u) and not (u = any (v_new)) then
      v_new := v_new || u;
    end if;
  end loop;

  if array_length(v_new, 1) is null then
    return;
  end if;
  select t.r_first, t.r_series into v_first, v_s from take_branch_order_nos(p_branch_id, array_length(v_new, 1)) t;
  foreach u in array v_new loop
    v_no := v_first + i;
    i := i + 1;
    v_id := nextval(v_seq);
    insert into order_no_reservations (business_id, order_no, order_id, branch_id, client_order_uuid, series)
    values (v_business, v_no, v_id, p_branch_id, u, v_s);
    r_order_no := v_no;
    r_order_id := v_id;
    r_client_order_uuid := u;
    r_series := v_s;
    return next;
  end loop;
end
$fn$;
revoke all on function public.reserve_order_numbers(bigint, uuid[]) from public, anon;
grant execute on function public.reserve_order_numbers(bigint, uuid[]) to authenticated;

-- ---------- كل طلب جديد ----------
-- المحجوز لـ uuid حقه يبقى برقمه وسلسلته (هذا اللي انطبع)، وإلا التالي من
-- عدّاد الفرع.
create or replace function public.orders_assign_order_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_no bigint;
  v_id bigint;
  v_s bigint;
begin
  if new.order_no is not null then
    return new;
  end if;
  if not exists (select 1 from order_number_blocks_enabled e where e.business_id = new.business_id) then
    return new;
  end if;
  if new.client_order_uuid is not null then
    update order_no_reservations x
       set used_at = now()
     where x.client_order_uuid = new.client_order_uuid
       and x.used_at is null
       and x.business_id = new.business_id
       and x.branch_id = new.branch_id
    returning x.order_no, x.order_id, x.series into v_no, v_id, v_s;
  end if;
  if v_no is null then
    select t.r_first, t.r_series into v_no, v_s from take_branch_order_nos(new.branch_id, 1) t;
  else
    new.id := v_id; -- الرقم الداخلي المحجوز معه، ليعرفه الجهاز قبل الإرسال
  end if;
  new.order_no := v_no;
  new.order_series := v_s;
  return new;
end
$fn$;

drop trigger if exists aaa_orders_assign_order_no on public.orders;
create trigger aaa_orders_assign_order_no
  before insert on public.orders
  for each row execute function public.orders_assign_order_no();
