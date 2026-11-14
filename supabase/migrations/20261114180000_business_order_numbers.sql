-- رقم طلب لكل منشأة: ١، ٢، ٣… لحالها.
--
-- كان الرقم المطبوع هو orders.id: عدّاد واحد لكل المنشآت، فيقفز رقم
-- المطعم كل ما باع مطعم ثاني. الآن لكل منشأة عدّادها (order_no)، و id
-- يبقى رقماً داخلياً للربط فقط -- ما ينطبع ولا يُعرض.
--
-- والأرقام المحجوزة صارت من عدّاد المنشأة: كل جهاز يحجز دفعة صغيرة (٦)،
-- فالفاتورة تنطبع برقمها النهائي فوراً، والفرق بين جهازين بسيط. والحجز
-- يحمل id الطلب أيضاً (من تسلسل orders)، فالجهاز يعرف رقمه الداخلي فوراً
-- ويربط به البيجر والطاولة مثل أي طلب.
--
-- يحلّ محل 20261114150000_order_number_blocks.sql (كان يحجز من id نفسه):
-- يحذف ما أنشأه إن كان شُغّل، ويشتغل لو ما شُغّل.
--
-- التشغيل لكل منشأة (order_number_blocks_enabled): المنشأة غير المفعّلة
-- ما ياخذ طلبها order_no ويبقى كل شي فيها مثل قبل (#id). النسخ القديمة
-- من التطبيق تعرض #id، فتُفعَّل المنشأة بعد ما تتحدّث أجهزتها.
--
-- التطبيق: react-native-poc/src/application/orderNumberPool.ts
-- الويب:    rkOrderNumberPool في public/pos/rakeen-pos.js

set lock_timeout = '5s';

-- ---------- القديم (يحجز من id) ----------
drop trigger if exists aaa_orders_take_reserved_id on public.orders;
drop function if exists public.orders_take_reserved_id();
drop function if exists public.reserve_order_ids(bigint, uuid[]);
drop table if exists public.order_id_reservations;

-- ---------- التفعيل لكل منشأة ----------
create table if not exists public.order_number_blocks_enabled (
  business_id bigint primary key references public.businesses(id) on delete cascade,
  enabled_at timestamptz not null default now()
);
alter table public.order_number_blocks_enabled enable row level security;
revoke all on public.order_number_blocks_enabled from anon, authenticated;

-- ---------- الرقم ----------
alter table public.orders add column if not exists order_no bigint;
create unique index if not exists orders_business_order_no_key
  on public.orders (business_id, order_no) where order_no is not null;

create table if not exists public.business_order_counters (
  business_id bigint primary key references public.businesses(id) on delete cascade,
  last_no bigint not null default 0
);
alter table public.business_order_counters enable row level security;
revoke all on public.business_order_counters from anon, authenticated;

create table if not exists public.order_no_reservations (
  business_id bigint not null references public.businesses(id) on delete cascade,
  order_no bigint not null,
  order_id bigint not null unique,
  branch_id bigint not null references public.branches(id) on delete cascade,
  client_order_uuid uuid not null unique,
  reserved_at timestamptz not null default now(),
  used_at timestamptz,
  primary key (business_id, order_no)
);
create index if not exists order_no_reservations_open_by_branch
  on public.order_no_reservations (branch_id) where used_at is null;
alter table public.order_no_reservations enable row level security;
revoke all on public.order_no_reservations from anon, authenticated;

-- يحجز n رقم متتالي من عدّاد المنشأة ويرجّع أولها. القفل على سطر المنشأة
-- وحده، فمنشأتين ما ينتظرون بعض.
create or replace function public.take_business_order_nos(p_business_id bigint, p_n int)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_last bigint;
begin
  insert into business_order_counters as c (business_id, last_no)
  values (p_business_id, p_n)
  on conflict (business_id) do update set last_no = c.last_no + p_n
  returning c.last_no into v_last;
  return v_last - p_n + 1;
end
$fn$;
revoke all on function public.take_business_order_nos(bigint, int) from public, anon, authenticated;

-- الجهاز يرسل uuids ولّدها، ويرجع لكل واحد رقم. نداء معاد بنفس الـ uuid
-- يرجّع نفس الرقم. المنشأة غير المفعّلة: ولا رقم.
drop function if exists public.reserve_order_numbers(bigint, uuid[]);
create function public.reserve_order_numbers(p_branch_id bigint, p_uuids uuid[])
returns table (r_order_no bigint, r_order_id bigint, r_client_order_uuid uuid)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_business bigint := current_business_id();
  v_n int := coalesce(array_length(p_uuids, 1), 0);
  v_open int;
  v_new uuid[] := '{}';
  v_first bigint;
  v_no bigint;
  v_id bigint;
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

  -- تنظيف: المستخدم بعد أسبوع، واليتيم (جهاز انمسح) بعد ٤٠ يوم.
  delete from order_no_reservations x
   where x.branch_id = p_branch_id
     and ((x.used_at is not null and x.used_at < now() - interval '7 days')
       or (x.used_at is null and x.reserved_at < now() - interval '40 days'));

  select count(*) into v_open from order_no_reservations x
   where x.branch_id = p_branch_id and x.used_at is null;
  if v_open + v_n > 500 then
    raise exception 'too many open reservations';
  end if;

  -- اللي محجوز من قبل يرجع كما هو؛ الجديد ياخذ دفعة وحدة متتالية.
  foreach u in array p_uuids loop
    v_no := null;
    select x.order_no, x.order_id into v_no, v_id from order_no_reservations x
     where x.client_order_uuid = u and x.business_id = v_business;
    if v_no is not null then
      r_order_no := v_no;
      r_order_id := v_id;
      r_client_order_uuid := u;
      return next;
    elsif not exists (select 1 from orders o where o.client_order_uuid = u) and not (u = any (v_new)) then
      v_new := v_new || u;
    end if;
  end loop;

  if array_length(v_new, 1) is null then
    return;
  end if;
  v_first := take_business_order_nos(v_business, array_length(v_new, 1));
  foreach u in array v_new loop
    v_no := v_first + i;
    i := i + 1;
    v_id := nextval(v_seq);
    insert into order_no_reservations (business_id, order_no, order_id, branch_id, client_order_uuid)
    values (v_business, v_no, v_id, p_branch_id, u);
    r_order_no := v_no;
    r_order_id := v_id;
    r_client_order_uuid := u;
    return next;
  end loop;
end
$fn$;
revoke all on function public.reserve_order_numbers(bigint, uuid[]) from public, anon;
grant execute on function public.reserve_order_numbers(bigint, uuid[]) to authenticated;

-- كل طلب جديد في منشأة مفعّلة ياخذ رقمه: المحجوز لـ uuid حقه، وإلا التالي
-- من العدّاد. فشل الإدخال بعدها؟ يتراجع الحجز معه (الرقم يرجع للمحاولة
-- الثانية)، أما رقم العدّاد فيضيع -- فجوة نادرة، مو تكرار.
create or replace function public.orders_assign_order_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_no bigint;
  v_id bigint;
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
    returning x.order_no, x.order_id into v_no, v_id;
  end if;
  if v_no is null then
    v_no := take_business_order_nos(new.business_id, 1);
  else
    new.id := v_id; -- الرقم الداخلي المحجوز معه، ليعرفه الجهاز قبل الإرسال
  end if;
  new.order_no := v_no;
  return new;
end
$fn$;

drop trigger if exists aaa_orders_assign_order_no on public.orders;
create trigger aaa_orders_assign_order_no
  before insert on public.orders
  for each row execute function public.orders_assign_order_no();

-- ---------- صفحات الزبون: نفس الرقم اللي على فاتورته ----------
-- صفحة البيجر وصفحة تتبّع الطلب تعرضان order_no (وإلا order_id).
-- الدالتان كما هما حرفياً من آخر نسخة، مع حقل order_no فقط.

create or replace function get_pager_status(p_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  o record;
  v_settings jsonb;
  v_items jsonb;
  v_rating jsonb;
begin
  -- الحدّ على المفتاح لا على الـ IP: زبائن المحل كلهم على واي فاي واحد.
  if not check_rate_limit('pager_key:' || p_key, 40, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;

  select ord.id, ord.order_no, ord.channel, ord.status, ord.created_at, ord.pager_eta_at, ord.ready_at,
         ord.delivered_at, ord.pager_delayed_at, ord.pager_rung_at, ord.pager_ring_count,
         ord.pager_seen_at, ord.customer_name, ord.business_id,
         b.name as biz_name, b.logo_url, b.online_theme_color, b.online_color_surf,
         b.online_color_card, b.online_color_ink, b.online_color_muted, b.online_font_family,
         b.pager_settings, b.pager_enabled, br.name as branch_name
    into o
    from orders ord
    join businesses b on b.id = ord.business_id
    left join branches br on br.id = ord.branch_id
   where ord.client_order_uuid = p_key;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  if o.pager_seen_at is null then
    update orders set pager_seen_at = now() where client_order_uuid = p_key and pager_seen_at is null;
  end if;

  v_settings := coalesce(o.pager_settings, '{}'::jsonb);
  if coalesce(v_settings -> 'show_items' <> 'false'::jsonb, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'n', left(coalesce(mi.name, sv.name, ''), 60),
             'q', oi.qty,
             'm', nullif(left((select string_agg(x ->> 'text', '، ')
                               from jsonb_array_elements(case when jsonb_typeof(oi.selected_modifiers) = 'array'
                                                              then oi.selected_modifiers else '[]'::jsonb end) x), 80), ''),
             'note', nullif(left(coalesce(oi.note, ''), 60), '')
           ) order by oi.id), '[]'::jsonb)
      into v_items
      from (select * from order_items where order_id = o.id order by id limit 30) oi
      left join menu_items mi on mi.id = oi.menu_item_id
      left join services sv on sv.id = oi.service_id;
  end if;

  -- التقييم: بعد ما يجهز الطلب (الاستلام، أو «استلمت طلبي» عند الزبون).
  if coalesce(v_settings -> 'rate' = 'true'::jsonb, false) and coalesce(o.pager_enabled, false)
     and o.ready_at is not null and o.status not in ('cancelled', 'refunded', 'rejected') then
    v_rating := jsonb_build_object(
      'google', case when coalesce(v_settings ->> 'google_url', '') ~ '^https://'
                     then left(v_settings ->> 'google_url', 300) end,
      'done', exists (select 1 from pager_ratings where order_id = o.id));
  end if;

  return jsonb_build_object(
    'found', true,
    'order_id', o.id,
    'order_no', o.order_no,
    'channel', o.channel,
    'status', o.status,
    'created_at', o.created_at,
    'eta_at', o.pager_eta_at,
    'ready_at', o.ready_at,
    'delivered_at', o.delivered_at,
    'delayed_at', o.pager_delayed_at,
    'rung_at', o.pager_rung_at,
    'ring_count', o.pager_ring_count,
    -- الاسم الأول وحده: الصفحة تُفتح من باركود قد يراه غيره.
    'customer', nullif(split_part(coalesce(o.customer_name, ''), ' ', 1), ''),
    'business', jsonb_build_object(
      'name', o.biz_name, 'logo', o.logo_url, 'accent', o.online_theme_color,
      'surf', o.online_color_surf, 'card', o.online_color_card, 'ink', o.online_color_ink,
      'muted', o.online_color_muted, 'font', o.online_font_family),
    'branch', o.branch_name,
    'ready_msg', nullif(left(coalesce(v_settings ->> 'ready_msg', ''), 80), ''),
    'tone', coalesce(nullif(v_settings ->> 'tone', ''), 'chime'),
    'show_eta', coalesce(v_settings -> 'show_eta' <> 'false'::jsonb, true),
    'items', v_items,
    'rating', v_rating
  );
end;
$fn$;
grant execute on function get_pager_status(uuid) to anon, authenticated;

drop function if exists get_order_status(uuid);
create or replace function get_order_status(p_token uuid)
returns table(
  order_id bigint, channel text, status text, ready_at timestamptz, scheduled_for timestamptz,
  created_at timestamptz, total numeric, customer_name text,
  business_name text, business_logo_url text, theme_color text, contact_whatsapp text,
  rejection_reason text, online_customer_note text, items jsonb,
  branch_name text, branch_address text, branch_lat numeric, branch_lng numeric,
  payment_method text, payment_status text,
  subtotal numeric, vat_amount numeric, business_vat_number text, vat_registered boolean,
  delivered_at timestamptz, out_for_delivery_at timestamptz, scheduled_by_customer boolean,
  order_no bigint
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return query
    select o.id, o.channel, o.status, o.ready_at, o.scheduled_for, o.created_at, o.total, o.customer_name,
           b.name, b.logo_url, b.online_theme_color, b.online_contact_whatsapp, o.rejection_reason,
           o.online_customer_note,
           (
             select coalesce(jsonb_agg(jsonb_build_object(
               'name', coalesce(oi.selected_modifiers->0->>'text', mi.name),
               'qty', oi.qty,
               'line_total', oi.line_total,
               'note', oi.note
             ) order by oi.id), '[]'::jsonb)
             from order_items oi
             join menu_items mi on mi.id = oi.menu_item_id
             where oi.order_id = o.id
           ) as items,
           case when o.channel = 'pickup' then br.name else null end,
           case when o.channel = 'pickup' then br.address else null end,
           case when o.channel = 'pickup' then br.lat else null end,
           case when o.channel = 'pickup' then br.lng else null end,
           o.payment_method, o.payment_status,
           o.subtotal, o.vat_amount, b.vat_number, coalesce(b.vat_registered, true),
           o.delivered_at, o.out_for_delivery_at, o.scheduled_by_customer,
           o.order_no
    from orders o
    join businesses b on b.id = o.business_id
    left join branches br on br.id = o.branch_id
    where o.tracking_token = p_token;
end;
$fn$;
grant execute on function get_order_status(uuid) to anon;
