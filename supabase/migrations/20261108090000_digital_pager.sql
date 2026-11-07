-- بيجر ركين: جوال الزبون هو جهاز النداء.
--
-- الكاشير يطبع على الفاتورة (ويعرض على شاشة العميل) باركوداً يفتح صفحة
-- الطلب في جوال الزبون. ولما يضغط الكاشير «جاهز» من «الطلبات ← جارية»
-- يرن جوال الزبون: صوت واهتزاز في الصفحة، وإشعار لو سمح به.
--
-- المفتاح هو client_order_uuid نفسه، لا tracking_token: الفاتورة تُطبع
-- قبل أن يصل الطلب للخادم (الكاشير يعمل بلا نت ويرفع لاحقاً)، فلا يُعرف
-- tracking_token وقت الطباعة. أما client_order_uuid فيولّده الجهاز قبل
-- كل شيء. والصفحة تقول «طلبك في الطريق» إلى أن يصل.
--
-- النشر آمن قبل تشغيل هذا الملف: كل عميل يقرأ الأعمدة الجديدة باستعلام
-- مستقل، وغيابها = البيجر مطفأ.

-- ─────────────────────────────────────────────── الإعدادات
alter table businesses add column if not exists pager_enabled boolean not null default false;
-- { channels:["dine_in","pickup"], prep_min:10, buffer_min:5, receipt:true,
--   display:true, display_secs:60, remind_min:3, close_min:20, wifi:"",
--   ready_msg:"", late_alert:true, tone:"chime" }
alter table businesses add column if not exists pager_settings jsonb not null default '{}'::jsonb;
alter table businesses drop constraint if exists businesses_pager_settings_object;
alter table businesses add constraint businesses_pager_settings_object
  check (jsonb_typeof(pager_settings) = 'object' and pg_column_size(pager_settings) < 2048);

comment on column businesses.pager_enabled is 'بيجر ركين: باركود على الفاتورة وشاشة العميل يحوّل جوال الزبون لجهاز نداء.';
comment on column businesses.pager_settings is 'خيارات بيجر ركين (انظر 20261108090000_digital_pager.sql).';

-- ─────────────────────────────────────────────── على الطلب
-- pager_eta_at: الوقت اللي وعدنا به الزبون (التجهيز + الاحتياط). وجوده
-- هو ما يجعل الطلب «طلب بيجر» يظهر في «جارية» حتى يُستلم.
alter table orders add column if not exists pager_eta_at timestamptz;
alter table orders add column if not exists pager_delayed_at timestamptz;
alter table orders add column if not exists pager_seen_at timestamptz;
alter table orders add column if not exists pager_rung_at timestamptz;
alter table orders add column if not exists pager_ring_count smallint not null default 0;

create index if not exists orders_pager_open_idx
  on orders (branch_id, created_at)
  where pager_eta_at is not null and delivered_at is null;

-- قراءة رقم صحيح من الإعدادات بلا أن يُسقط الإدراج قيمةٌ مكتوبة غلط.
create or replace function pager_int(p jsonb, p_key text, p_default int, p_min int, p_max int)
returns int
language sql
immutable
as $$
  select greatest(p_min, least(p_max,
    case when (p ->> p_key) ~ '^\d{1,4}$' then (p ->> p_key)::int else p_default end));
$$;

-- يقرّر عند الإدراج: هل هذا طلب بيجر؟
-- لا للطلبات الأونلاين (لها صفحة تتبعها)، ولا للتوصيل، ولا لطلبٍ جاهز من
-- لحظته («تخطي مرحلة جاهز» مفعّل لقناته -- وإلا رنّ الجوال قبل أن يجلس)،
-- ولا للمحلي في «خدمة طاولات» (الطلب يُحمل للطاولة).
create or replace function orders_set_pager_eta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_settings jsonb;
  v_mode text;
  v_channels jsonb;
begin
  if new.source is distinct from 'pos' or new.ready_at is not null
     or new.channel = 'delivery' or new.pager_eta_at is not null then
    return new;
  end if;

  select b.pager_enabled, b.pager_settings, b.dine_in_mode
    into v_enabled, v_settings, v_mode
    from businesses b where b.id = new.business_id;
  if not coalesce(v_enabled, false) then
    return new;
  end if;

  v_channels := coalesce(v_settings -> 'channels', '["dine_in","pickup"]'::jsonb);
  if jsonb_typeof(v_channels) <> 'array' or not (v_channels ? new.channel) then
    return new;
  end if;
  if new.channel = 'dine_in' and v_mode = 'tables' then
    return new;
  end if;

  new.pager_eta_at := now() + make_interval(mins =>
    pager_int(v_settings, 'prep_min', 10, 1, 120) + pager_int(v_settings, 'buffer_min', 5, 0, 60));
  return new;
end;
$$;

drop trigger if exists orders_set_pager_eta on orders;
create trigger orders_set_pager_eta
  before insert on orders
  for each row execute function orders_set_pager_eta();

-- ─────────────────────────────────────────────── اشتراكات الإشعار
-- بالمفتاح لا برقم الطلب: الزبون قد يمسح ويسمح بالإشعار قبل أن يصل طلبٌ
-- مرفوعٌ لاحقاً.
create table if not exists pager_push_subscriptions (
  id bigserial primary key,
  order_key uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (order_key, endpoint)
);
alter table pager_push_subscriptions enable row level security;
-- لا سياسات: لا يقرؤها ولا يكتبها إلا الدوال المعرّفة ومفتاح الخدمة.
create index if not exists pager_push_subscriptions_created_idx on pager_push_subscriptions (created_at);

-- ─────────────────────────────────────────────── صفحة الزبون
create or replace function get_pager_status(p_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  v_settings jsonb;
begin
  -- الحدّ على المفتاح لا على الـ IP: زبائن المحل كلهم على واي فاي واحد.
  if not check_rate_limit('pager_key:' || p_key, 40, 60) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;

  select ord.id, ord.channel, ord.status, ord.created_at, ord.pager_eta_at, ord.ready_at,
         ord.delivered_at, ord.pager_delayed_at, ord.pager_rung_at, ord.pager_ring_count,
         ord.pager_seen_at, ord.customer_name, ord.business_id,
         b.name as biz_name, b.logo_url, b.online_theme_color, b.online_color_surf,
         b.online_color_card, b.online_color_ink, b.online_color_muted, b.online_font_family,
         b.pager_settings, br.name as branch_name
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
  return jsonb_build_object(
    'found', true,
    'order_id', o.id,
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
    'tone', coalesce(nullif(v_settings ->> 'tone', ''), 'chime')
  );
end;
$$;
grant execute on function get_pager_status(uuid) to anon, authenticated;

create or replace function subscribe_pager_push(p_key uuid, p_endpoint text, p_p256dh text, p_auth text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not check_rate_limit('pager_sub:' || p_key, 10, 600) then
    raise exception 'محاولات كثيرة، حاول بعد شوي';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or length(coalesce(p_p256dh, '')) not between 20 and 200
     or length(coalesce(p_auth, '')) not between 8 and 100 then
    return false;
  end if;

  -- الطلب بعد يومين انتهى، وما بقي له اشتراك يُرسل له.
  delete from pager_push_subscriptions where created_at < now() - interval '2 days';

  if (select count(*) from pager_push_subscriptions where order_key = p_key) >= 3 then
    return false;
  end if;

  insert into pager_push_subscriptions (order_key, endpoint, p256dh, auth)
  values (p_key, p_endpoint, p_p256dh, p_auth)
  on conflict (order_key, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
  return true;
end;
$$;
grant execute on function subscribe_pager_push(uuid, text, text, text) to anon, authenticated;

-- ─────────────────────────────────────────────── أزرار الكاشير
-- «رنّ مرة ثانية»: لطلبٍ جاهز لم يُستلم.
create or replace function pager_ring(p_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_key uuid;
  v_count smallint;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  update orders set pager_rung_at = now(), pager_ring_count = least(pager_ring_count + 1, 99)
   where id = p_order_id and business_id = v_business_id
     and ready_at is not null and delivered_at is null
  returning client_order_uuid, pager_ring_count into v_key, v_count;
  if v_key is null then
    raise exception 'الطلب مو جاهز أو انستلم';
  end if;
  return jsonb_build_object('key', v_key, 'ring_count', v_count);
end;
$$;
grant execute on function pager_ring(bigint) to authenticated;

-- «+٥ دقايق»: يمدّ الوعد ويقول للزبون إننا تأخرنا، بدل ما يحس إنه نُسي.
create or replace function pager_bump_eta(p_order_id bigint, p_minutes int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint := current_business_id();
  v_key uuid;
  v_eta timestamptz;
begin
  if not has_permission('pos:register') then
    raise exception 'not authorized';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 30 then
    raise exception 'مدة غير صالحة';
  end if;
  update orders
     set pager_eta_at = least(greatest(pager_eta_at, now()) + make_interval(mins => p_minutes),
                              created_at + interval '4 hours'),
         pager_delayed_at = now()
   where id = p_order_id and business_id = v_business_id
     and pager_eta_at is not null and ready_at is null and delivered_at is null
  returning client_order_uuid, pager_eta_at into v_key, v_eta;
  if v_key is null then
    raise exception 'الطلب جاهز أو انستلم';
  end if;
  return jsonb_build_object('key', v_key, 'eta_at', v_eta);
end;
$$;
grant execute on function pager_bump_eta(bigint, int) to authenticated;

-- ─────────────────────────────────────────────── البثّ من القاعدة نفسها
-- لا أحد يسأل كل شوي: صفحة الزبون وشاشة العميل تستمعان لقناة الطلب،
-- والقاعدة تبثّ عند كل تغيّرٍ يهمّهما -- وصل الطلب، جاهز، رنّة، تأجيل،
-- استُلم، فتحه الزبون. فأيّ مسارٍ غيّر الطلب (الكاشير، المطبخ، دالةٌ
-- قديمة) يصل بثّه، ولا طلب على Cloudflare.
-- والبثّ بلا تفاصيل: من عرف المفتاح يجلبها بـ get_pager_status.
create or replace function orders_pager_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.ready_at is not distinct from old.ready_at
     and new.delivered_at is not distinct from old.delivered_at
     and new.status is not distinct from old.status
     and new.pager_eta_at is not distinct from old.pager_eta_at
     and new.pager_seen_at is not distinct from old.pager_seen_at
     and new.pager_ring_count is not distinct from old.pager_ring_count then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'seen', new.pager_seen_at is not null,
        'ready', new.ready_at is not null,
        'collected', new.delivered_at is not null,
        'ring_count', new.pager_ring_count),
      'pager',
      'pager:' || new.client_order_uuid::text,
      false);
  exception when others then
    -- البثّ لا يُسقط حفظ الطلب أبداً.
    null;
  end;
  return null;
end;
$$;

drop trigger if exists orders_pager_broadcast on orders;
create trigger orders_pager_broadcast
  after insert or update on orders
  for each row
  when (new.pager_eta_at is not null)
  execute function orders_pager_broadcast();

-- البثّ يعتمد على realtime.send (Broadcast from Database). لو ما وُجدت في
-- المشروع يفشل الملف هنا بصوتٍ عالٍ، بدل بيجرٍ لا يرن أبداً بصمت.
do $chk$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    raise exception 'realtime.send غير موجودة: فعّل Realtime في المشروع ثم أعد تشغيل الملف';
  end if;
end;
$chk$;
