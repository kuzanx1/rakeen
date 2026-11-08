-- بيجر ركين: «قيّم طلبك» بعد الاستلام.
--
-- الإعداد في pager_settings نفسه (بلا أعمدة جديدة):
--   rate        true = اسأل الزبون عن تقييمه بعد ما يجهز/يستلم طلبه
--   google_url  رابط تقييم المحل في قوقل (اختياري)
-- ٤-٥ نجوم: الصفحة تفتح رابط قوقل. ١-٣: ملاحظة خاصة (ورقم واتساب اختياري)
-- تروح لصاحب المحل وحده، ويوصله إشعار.
--
-- الكتابة كلها من /api/pager/rate بمفتاح الخدمة (يتحقق من المفتاح
-- والإعداد ويرسل الإشعار) -- فما فيه سياسة insert للعامة هنا.
-- التقييم مرتبط بالبيجر، والبيجر مقفول على عماد وصرح بـ rk_businesses_guard
-- (pager_enabled := false لغيرهم) -- فالتقييم يتبعه بلا فحص ثاني.
-- يُعاد تشغيله بلا ضرر.

create table if not exists pager_ratings (
  id bigserial primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  order_id bigint not null unique references orders(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  tags text[] not null default '{}',
  note text check (note is null or char_length(note) <= 500),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{9,15}$'),
  created_at timestamptz not null default now()
);
create index if not exists pager_ratings_business_idx on pager_ratings (business_id, created_at desc);

alter table pager_ratings enable row level security;
drop policy if exists pager_ratings_tenant_read on pager_ratings;
create policy pager_ratings_tenant_read on pager_ratings
  for select using (business_id = current_business_id());
grant select on pager_ratings to authenticated;

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

  select ord.id, ord.channel, ord.status, ord.created_at, ord.pager_eta_at, ord.ready_at,
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
