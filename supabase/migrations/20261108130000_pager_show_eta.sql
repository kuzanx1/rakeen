-- بيجر ركين: خيار «اعرض للزبون وقت متوقع» (pager_settings.show_eta).
-- مطفأ: صفحة الزبون ما تعرض وقتاً، والكاشير يعدّ على وقت التحضير بلا «+٥ د».
-- pager_eta_at يبقى يُحسب كما هو (هو علامة «طلب بيجر» نفسها) -- الصفحة فقط
-- تخفيه. كل ما يتغيّر هنا: get_pager_status يرجّع show_eta.
-- يُعاد تشغيله بلا ضرر.

create or replace function get_pager_status(p_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
    'tone', coalesce(nullif(v_settings ->> 'tone', ''), 'chime'),
    'show_eta', coalesce(v_settings -> 'show_eta' <> 'false'::jsonb, true)
  );
end;
$fn$;
grant execute on function get_pager_status(uuid) to anon, authenticated;
