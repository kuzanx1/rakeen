-- رمزُ الشاشة الدائم: قصيرٌ يُكتب، ولا ينتهي فيُعاد.
--
-- الرابطُ الحامل للسرّ حلَّ مشكلة الدوام وخلق مشكلة النقل: ستّون حرفاً،
-- ولوحةُ التحكم على جهازٍ وشاشةُ العميل على آخر -- فلا نسخَ ولا لصق،
-- إنما نقلٌ بالعين واليد. وستّون حرفاً ست عشرية تُنقل بالعين خطأٌ
-- مؤكّد، لا محتمل.
--
-- والرمزُ القديم كان قصيراً يُكتب، وعلّتُه أنه يموت: عشر دقائق، ومرّةً
-- واحدة، وما ينتج عنه يسكن تخزين المتصفّح فيُمحى -- فيُعاد كل بضعة
-- أيام. فالعلّة في فنائه لا في قِصَره.
--
-- فهذا يجمع الاثنين: ثمانية أحرف تُكتب في نصف دقيقة، وتبقى ما بقيت
-- الشاشة. يُمحى تخزين الجهاز كلُّه فلا يضرّ -- العنوانُ المحفوظ صفحةً
-- رئيسية يحمل الرمز، والرمزُ يُبدَّل بالسرّ في كل فتحة.
--
-- وثمانيةٌ من أبجدية أحدٍ وثلاثين = 8.5 × 10^11 احتمالاً. لا تُخمّن عبر
-- الشبكة، ولا تُقرأ خطأً: بلا 0/O ولا 1/I/L.

alter table display_devices add column if not exists link_token text;

create unique index if not exists display_devices_link_token
  on display_devices(link_token) where link_token is not null;

create or replace function generate_display_link_token()
returns text
language plpgsql
as $gen$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..8 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out;
end;
$gen$;

/**
 * يُنشأ عند الطلب لا عند الترحيل وحده.
 *
 * الشاشات القائمة تُملأ الآن، والقادمةُ عند إنشائها -- ولا صفَّ يبقى
 * بلا رمزٍ فيقف المالك أمام زرٍّ لا يعطيه شيئاً.
 */
create or replace function ensure_display_link_token(p_device_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $ens$
declare
  v_token text;
  v_business_id bigint;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('settings:edit') then
    return null;
  end if;

  select link_token into v_token from display_devices
  where id = p_device_id and business_id = v_business_id;
  if v_token is not null then return v_token; end if;

  for i in 1..8 loop
    v_token := generate_display_link_token();
    exit when not exists (select 1 from display_devices where link_token = v_token);
  end loop;

  update display_devices set link_token = v_token
  where id = p_device_id and business_id = v_business_id and link_token is null
  returning link_token into v_token;

  return v_token;
end;
$ens$;

revoke all on function ensure_display_link_token(bigint) from public, anon;
grant execute on function ensure_display_link_token(bigint) to authenticated;

-- والقائمُ يُملأ الآن: الشاشة المقترنة اليوم لا تُترك بلا رمزٍ دائم.
do $backfill$
declare
  r record;
  t text;
begin
  for r in select id from display_devices where link_token is null loop
    loop
      t := generate_display_link_token();
      exit when not exists (select 1 from display_devices where link_token = t);
    end loop;
    update display_devices set link_token = t where id = r.id;
  end loop;
end;
$backfill$;

/**
 * يُبدَّل الرمز بالسرّ في كل فتحة -- بلا جلسة، وبلا فناء.
 *
 * تُنادى من الشاشة نفسها: الجهاز لا يسجّل دخول أحد، إنما يقول "أنا
 * حاملُ هذا الرمز". ولا يُبطَل بعد الاستعمال -- وهذا كلُّ الفرق عن
 * redeem_display_pairing_code: تلك تموت مرّةً فيعود الطلب، وهذه تُنادى
 * ألف مرّة فلا يُطلب شيء.
 *
 * ويُسجَّل user_agent هنا: كان يُكتب في مسار الرمز المؤقّت وحده، فلمّا
 * ذهب ذاك صارت الشاشات كلُّها "جهاز" بلا تمييز.
 */
create or replace function resolve_display_link_token(p_token text, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $res$
declare
  v_secret text;
  v_slug text;
  v_label text;
begin
  update display_devices d
  set last_seen_at = now(),
      paired_at = coalesce(d.paired_at, now()),
      user_agent = coalesce(left(p_user_agent, 300), d.user_agent)
  from businesses b
  where d.business_id = b.id
    and d.link_token = upper(trim(p_token))
  returning d.device_secret, b.online_menu_slug, d.label
  into v_secret, v_slug, v_label;

  if v_secret is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_token');
  end if;
  return jsonb_build_object('ok', true, 'secret', v_secret, 'slug', v_slug, 'label', v_label);
end;
$res$;

revoke all on function resolve_display_link_token(text, text) from public;
grant execute on function resolve_display_link_token(text, text) to anon, authenticated;

-- ورابطُ اللوحة يُعطي الرمز القصير، لا السرّ الطويل.
create or replace function get_display_device_link(p_device_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $link$
declare
  v_business_id bigint;
  v_token text;
  v_slug text;
  v_label text;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('settings:edit') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_token := ensure_display_link_token(p_device_id);
  if v_token is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select b.online_menu_slug, d.label into v_slug, v_label
  from display_devices d join businesses b on b.id = d.business_id
  where d.id = p_device_id and d.business_id = v_business_id;

  return jsonb_build_object('ok', true, 'token', v_token, 'slug', v_slug, 'label', v_label);
end;
$link$;

revoke all on function get_display_device_link(bigint) from public, anon;
grant execute on function get_display_device_link(bigint) to authenticated;
