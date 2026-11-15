-- «يوم العمل»، ورقم الطلب يرجع ١ مع بداية كل يوم عمل، ولكل فرع عدّاده.
--
-- قبل: عدّاد واحد للمنشأة يكمل للأبد (20261114180000_business_order_numbers).
-- صاحب المحل: «الفاتورة والبيجر يتصفرون يومياً، هذا المفروض في أي مطعم».
--
-- يوم العمل مو اليوم بالتقويم: مقهى يداوم من ٤ العصر لـ ٢ الفجر يومه
-- [٤ الفجر ← ٤ الفجر]، فبيع الساعة ١ فجراً من ليلته هو، لا من الغد. نفس
-- فكرة Toast (closeout hour) وفوديكس (Business Day). الحد = businesses.
-- day_cutoff_hour (موجود من التقرير اليومي)، والحين صار هو الحد لكل شي:
-- الرئيسية والتقارير والتقرير اليومي وأرقام الطلبات.
--
-- يتحدد لحاله (day_cutoff_auto) من دوام الفروع لو محطوط، وإلا من أوقات
-- الطلبات بآخر ٤ أسابيع. وصاحب المحل يقدر يثبّته بيده من الإعدادات.
--
-- ليش مو «كل وردية»: محل بورديتين (صباحي يسلّم مسائي) كان يرجع #1 مرتين
-- باليوم، والرئيسية تتصفر نص اليوم. والوردية المنسية مفتوحة كانت تمدّ اليوم
-- أيام. الحد بالساعة ثابت، ويعرفه الجهاز بلا نت.
--
-- السلسلة (series) = تاريخ يوم العمل YYYYMMDD، والعدّاد يرجع صفر بنفسه أول
-- ما ياخذ رقم بيوم جديد -- بلا trigger وبلا مؤقّت.
--
-- الرقم يتكرر الحين (كل يوم فيه #1)، فالفريد صار (الفرع، السلسلة، الرقم).
-- والفاتورة الضريبية تحتاج رقم ما يتكرر: تنطبع «رقم الفاتورة» = orders.id
-- (الرقم الداخلي) سطراً صغيراً، ورقم الطلب الكبير هو اللي يتصفّر.
--
-- الأجهزة تحجز أرقام مسبقاً (orderNumberPool): كل حجز يحمل سلسلته، والجهاز
-- يرمي ما ليس من يوم العمل الحالي، والخادم يحذف غير المستخدم من سلسلة قديمة.
--
-- التطبيق: react-native-poc/src/application/orderNumberPool.ts
-- الويب:    rkOrderNumberPool في public/pos/rakeen-pos.js

set lock_timeout = '5s';

-- ---------- يوم العمل ----------
alter table public.businesses add column if not exists day_cutoff_auto boolean not null default true;
alter table public.businesses add column if not exists day_cutoff_checked_at timestamptz;

-- تاريخ يوم العمل (YYYYMMDD) عند لحظة: الساعة بالرياض ناقص ساعة الإقفال.
create or replace function public.rk_business_day_key(p_business_id bigint, p_at timestamptz default now())
returns bigint
language sql
stable
security definer
set search_path = public
as $fn$
  select to_char((p_at at time zone 'Asia/Riyadh') - make_interval(hours => coalesce(b.day_cutoff_hour, 0)), 'YYYYMMDD')::bigint
    from businesses b where b.id = p_business_id;
$fn$;
revoke all on function public.rk_business_day_key(bigint, timestamptz) from public, anon, authenticated;

-- ساعة الإقفال المقترحة (٠-١١)، أو null لو ما فيه بيانات كفاية.
-- ١) دوام الفروع لو محطوط: فرع يقفل بعد ١٢ الليل ← ساعتين بعد إقفاله،
--    وما تتعدّى ساعة فتحه. كل الفروع تقفل قبل ١٢ ← ١٢ منتصف الليل.
-- ٢) وإلا أوقات الطلبات بآخر ٤ أسابيع: أول ساعة هادية بعد ١٢ الليل.
--    (هادية = أقل من ١٪ من الطلبات.) ما فيه ساعة هادية = يشتغل ٢٤ ساعة ← ٦ الصبح.
create or replace function public.rk_detect_day_cutoff(p_business_id bigint)
returns int
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_last int;      -- آخر ساعة شغل بعد ١٢ الليل (٠ = يقفل قبلها)
  v_open int;      -- أبكر ساعة فتح لفرع يسهر
  v_has_hours boolean;
  v_cnt int[] := array_fill(0, array[24]);
  v_total int := 0;
  r record;
  h int;
begin
  select bool_or(true),
         max(case when br.closing_time <= br.opening_time
                  then extract(hour from br.closing_time)::int + (case when extract(minute from br.closing_time) > 0 then 1 else 0 end)
                  else 0 end),
         min(case when br.closing_time <= br.opening_time and br.closing_time <> '00:00'::time
                  then extract(hour from br.opening_time)::int end)
    into v_has_hours, v_last, v_open
    from branches br
   where br.business_id = p_business_id
     and br.opening_time is not null and br.closing_time is not null
     and br.opening_time <> br.closing_time;

  if not coalesce(v_has_hours, false) then
    for r in
      select extract(hour from o.created_at at time zone 'Asia/Riyadh')::int as hr, count(*)::int as c
        from orders o
       where o.business_id = p_business_id and o.created_at > now() - interval '28 days'
       group by 1
    loop
      v_cnt[r.hr + 1] := r.c;
      v_total := v_total + r.c;
    end loop;
    if v_total < 40 then
      return null;
    end if;
    if v_cnt[1] <= v_total * 0.01 then
      v_last := 0;
    else
      v_last := null;
      for h in 1..11 loop
        if v_cnt[h + 1] <= v_total * 0.01 then
          v_last := h;
          exit;
        end if;
      end loop;
      if v_last is null then
        return 6;
      end if;
    end if;
  end if;

  if v_last = 0 then
    return 0;
  end if;
  return least(v_last + 2, coalesce(v_open, 11), 11);
end
$fn$;
revoke all on function public.rk_detect_day_cutoff(bigint) from public, anon, authenticated;

-- اللوحة تناديها عند الفتح: لو «تلقائي» تحدّث الساعة (مرة باليوم، أو فوراً
-- بعد تعديل دوام فرع)، وترجّع الساعة المعتمدة.
create or replace function public.refresh_day_cutoff(p_force boolean default false)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_business bigint := current_business_id();
  b record;
  v_new int;
begin
  select id, day_cutoff_hour, day_cutoff_auto, day_cutoff_checked_at into b
    from businesses where id = v_business;
  if b.id is null then
    return 0;
  end if;
  if not b.day_cutoff_auto
     or (not p_force and b.day_cutoff_checked_at is not null and b.day_cutoff_checked_at > now() - interval '20 hours') then
    return b.day_cutoff_hour;
  end if;
  v_new := rk_detect_day_cutoff(v_business);
  update businesses
     set day_cutoff_checked_at = now(),
         day_cutoff_hour = coalesce(v_new, day_cutoff_hour)
   where id = v_business;
  return coalesce(v_new, b.day_cutoff_hour);
end
$fn$;
revoke all on function public.refresh_day_cutoff(boolean) from public, anon;
grant execute on function public.refresh_day_cutoff(boolean) to authenticated;

-- السلسلة الحالية للفرع = تاريخ يوم العمل.
create or replace function public.rk_branch_order_series(p_branch_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $fn$
  select rk_business_day_key(b.business_id) from branches b where b.id = p_branch_id;
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
-- قبل لحظة من بداية يوم جديد) ما ترجّع العدّاد للوراء: تاخذ من الأحدث.
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

-- البداية: كل فرع يكمل من رقمه الحالي لين يوم العمل الجاي، فما يرجع ١ وسط
-- اليوم ولا يتكرر رقم محجوز بجهاز.
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
-- مثل قبل، و r_series زيادة: الجهاز يرمي أي رقم من يوم غير يومه.
-- و r_day_cutoff: ساعة إقفال اليوم، فيعرف الجهاز يومه بلا نت.
drop function if exists public.reserve_order_numbers(bigint, uuid[]);
create function public.reserve_order_numbers(p_branch_id bigint, p_uuids uuid[])
returns table (r_order_no bigint, r_order_id bigint, r_client_order_uuid uuid, r_series bigint, r_day_cutoff int)
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
  v_cutoff int;
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
  select b.day_cutoff_hour into v_cutoff from businesses b where b.id = v_business;
  r_day_cutoff := v_cutoff;

  -- تنظيف: غير المستخدم من يوم سابق بعد يومين (جهاز بنسخة قديمة يطبع
  -- رقمه المحجوز، فيبقى له لين يرتفع طلبه بنفس الرقم)، والمستخدم بعد أسبوع.
  delete from order_no_reservations x
   where x.branch_id = p_branch_id
     and ((x.used_at is null and x.series < v_series and x.reserved_at < now() - interval '2 days')
       or (x.used_at is not null and x.used_at < now() - interval '7 days')
       or (x.used_at is null and x.reserved_at < now() - interval '40 days'));

  -- الحد على اليوم الحالي بس: بواقي الأيام السابقة ما تسدّ الحجز.
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


-- ---------- خيار: إخفاء «رقم الفاتورة» من الإيصال ----------
-- مثل فوديكس (Check Number): يبقى محفوظ بالطلب والتقارير، والإيصال يطبع
-- رقم الطلب بس. الافتراضي: يُطبع.
alter table public.businesses add column if not exists receipt_show_invoice_no boolean not null default true;
