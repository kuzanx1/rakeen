-- ١) رقم الطلب يرجع #١ مع كل «يوم عمل» (حسب ساعة إقفال اليوم من دوام
--    المحل)، وصاحب المحل يختار أول رقم، وبعد ٩٩٩٩ يرجع ١.
-- ٢) إعدادات ورقة الموازنة من الكاشير (برمز المدير)، ومنها أصناف مخزون
--    تنطبع «كم انباع منها بالوردية».
--
-- الترقيم يبقى على يوم العمل (20261115120000_shift_order_numbers.sql):
-- صاحب المحل اختاره بعد المقارنة، لأن محل بورديتين كان بيطلع عنده #١٢
-- مرتين باليوم (المطبخ والبيجر والشكاوى). قفل الوردية وفتحها بنفس اليوم
-- يكمّل الأرقام، ويرجع ١ أول وردية بيوم جديد.
--
-- أول رقم (shifts.order_no_start): العدّاد ما يرجع للوراء أبداً، فالرقم
-- يرفعه بس: أول وردية باليوم تبدأ منه، ووردية ثانية بنفس اليوم برقم أكبر
-- (مثلاً المسائية من ٥٠٠) تقفز له، وأصغر من اللي وصله اليوم = يكمّل عادي.
--
-- بعد ٩٩٩٩ يرجع ١، ويتخطّى أي رقم انأخذ بنفس اليوم (الفريد = الفرع،
-- السلسلة، الرقم)، فما يتكرر رقم باليوم.
--
-- التطبيق: orderNumberPool.ts + OpenShiftScreen.tsx · الويب: rkOrderNumberPool

begin;
set local lock_timeout = '5s';

-- ---------- أول رقم ----------
alter table public.shifts add column if not exists order_no_start int;
alter table public.shifts drop constraint if exists shifts_order_no_start_chk;
alter table public.shifts add constraint shifts_order_no_start_chk
  check (order_no_start is null or (order_no_start between 1 and 9999));
comment on column public.shifts.order_no_start is
  'أول رقم طلب يطلبه فاتح الوردية (١–٩٩٩٩). يرفع عدّاد اليوم بس، ما ينزّله.';

-- السلسلة = تاريخ يوم العمل (مثل 20261115120000، بلا تغيير).
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

-- n رقم متتالي من عدّاد الفرع. يوم جديد = من ١. بعد ٩٩٩٩ = من ١، ويتخطّى
-- الأرقام المأخوذة بنفس اليوم (طلب أو حجز).
create or replace function public.take_branch_order_nos(p_branch_id bigint, p_n int, out r_first bigint, out r_series bigint)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_series bigint := rk_branch_order_series(p_branch_id);
  v_last bigint;
  v_first bigint;
  v_hit bigint;
  v_tries int := 0;
begin
  if p_n < 1 or p_n > 50 then
    raise exception 'between 1 and 50 numbers per call';
  end if;
  insert into branch_order_counters (branch_id, series, last_no)
  values (p_branch_id, v_series, 0)
  on conflict (branch_id) do nothing;
  select c.series, c.last_no into r_series, v_last
    from branch_order_counters c where c.branch_id = p_branch_id
     for update;
  -- سلسلة أقدم (قُرئت قبل لحظة من بداية يوم جديد) ما ترجّع العدّاد للوراء.
  if v_series > r_series then
    r_series := v_series;
    v_last := 0;
  end if;
  v_first := v_last + 1;
  loop
    if v_first + p_n - 1 > 9999 then
      v_first := 1;
    end if;
    select max(t.n) into v_hit from (
      select o.order_no as n from orders o
       where o.branch_id = p_branch_id and o.order_series = r_series
         and o.order_no between v_first and v_first + p_n - 1
      union all
      select x.order_no from order_no_reservations x
       where x.branch_id = p_branch_id and x.series = r_series
         and x.order_no between v_first and v_first + p_n - 1
    ) t;
    exit when v_hit is null;
    v_first := v_hit + 1;
    v_tries := v_tries + 1;
    if v_tries > 500 then
      raise exception 'ما فيه أرقام طلبات فاضية اليوم';
    end if;
  end loop;
  update branch_order_counters
     set series = r_series, last_no = v_first + p_n - 1
   where branch_id = p_branch_id;
  r_first := v_first;
end
$fn$;
revoke all on function public.take_branch_order_nos(bigint, int) from public, anon, authenticated;

-- فتح وردية بأول رقم: يرفع عدّاد اليوم له (ما ينزّله).
create or replace function public.rk_shift_starts_order_numbers()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_series bigint;
begin
  if new.order_no_start is null or new.order_no_start <= 1 then
    return new;
  end if;
  if not exists (select 1 from order_number_blocks_enabled e where e.business_id = new.business_id) then
    return new;
  end if;
  v_series := rk_branch_order_series(new.branch_id);
  insert into branch_order_counters as c (branch_id, series, last_no)
  values (new.branch_id, v_series, new.order_no_start - 1)
  on conflict (branch_id) do update
    set last_no = case when excluded.series > c.series then excluded.last_no
                       else greatest(c.last_no, excluded.last_no) end,
        series = greatest(c.series, excluded.series);
  return new;
end
$fn$;
revoke all on function public.rk_shift_starts_order_numbers() from public, anon, authenticated;

drop trigger if exists rk_shift_starts_order_numbers on public.shifts;
create trigger rk_shift_starts_order_numbers
  after insert on public.shifts
  for each row execute function public.rk_shift_starts_order_numbers();

-- ---------- ورقة الموازنة: أصناف من المخزون ----------
alter table public.businesses
  add column if not exists shift_report_stock_items bigint[] not null default '{}';
comment on column public.businesses.shift_report_stock_items is
  'أصناف مخزون تنطبع بورقة الموازنة: كم انصرف منها بطلبات الوردية.';

-- كم انصرف من كل صنف بطلبات وردية (البيع ناقص المرتجع)، للأصناف المختارة.
create or replace function public.rk_shift_stock_usage(p_shift_id bigint)
returns table (stock_item_id bigint, name text, unit text, used numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_business bigint := current_business_id();
  v_items bigint[];
begin
  if not (has_permission('pos:register') or has_permission('screen:staff')) then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from shifts s where s.id = p_shift_id and s.business_id = v_business) then
    return;
  end if;
  select b.shift_report_stock_items into v_items from businesses b where b.id = v_business;
  if v_items is null or array_length(v_items, 1) is null then
    return;
  end if;
  return query
    select si.id, si.name::text, si.unit::text,
           coalesce((select -sum(m.delta)
                       from stock_movements m
                       join orders o on o.id = m.order_id
                      where m.stock_item_id = si.id
                        and m.business_id = v_business
                        and m.reason in ('sale', 'refund')
                        and o.shift_id = p_shift_id), 0)::numeric
      from stock_items si
     where si.business_id = v_business and si.id = any (v_items)
     order by array_position(v_items, si.id);
end
$fn$;
revoke all on function public.rk_shift_stock_usage(bigint) from public, anon;
grant execute on function public.rk_shift_stock_usage(bigint) to authenticated;

-- الكاشير يغيّر إعدادات الورقة برمز المدير (الجهاز ما يقدر يعدّل businesses).
create or replace function public.pos_set_shift_report_settings(p_pin text, p_options jsonb, p_stock_items bigint[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_business bigint := current_business_id();
  v_hash text;
  v_items bigint[];
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  if not check_rate_limit('verify_manager_pin:' || auth.uid(), 10, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;
  select pos_manager_pin_hash into v_hash from businesses where id = v_business;
  if v_hash is null then
    raise exception 'ما فيه رمز مدير. حطّه من لوحة التحكم أول';
  end if;
  if v_hash <> extensions.crypt(coalesce(p_pin, ''), v_hash) then
    raise exception 'رمز المدير غلط';
  end if;
  if p_options is not null and jsonb_typeof(p_options) <> 'object' then
    raise exception 'bad options';
  end if;
  -- بس أصناف هالمنشأة، وبحد معقول.
  select coalesce(array_agg(si.id order by array_position(p_stock_items, si.id)), '{}')
    into v_items
    from stock_items si
   where si.business_id = v_business and si.id = any (coalesce(p_stock_items, '{}'));
  if array_length(v_items, 1) > 20 then
    raise exception 'أقصى شي ٢٠ صنف';
  end if;
  update businesses
     set shift_report_options = coalesce(p_options, shift_report_options),
         shift_report_stock_items = v_items
   where id = v_business;
end
$fn$;
revoke all on function public.pos_set_shift_report_settings(text, jsonb, bigint[]) from public, anon;
grant execute on function public.pos_set_shift_report_settings(text, jsonb, bigint[]) to authenticated;

commit;
