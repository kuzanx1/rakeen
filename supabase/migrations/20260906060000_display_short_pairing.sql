-- اقتران بالرمز القصير: يُقرأ من شاشة ويُكتب في أخرى.
--
-- كان رمز الاقتران هو السرّ نفسه -- اثنان وثلاثون حرفاً ست عشرية.
-- وذلك يصلح لما يُنسخ ويُلصق، ولا يصلح لما يُنقل بين جهازين: المالك
-- يقرؤه من حاسبه ويكتبه في تابلت، فيخطئ حرفاً ولا يدري أيّها.
--
-- والصواب أن يُفصل الرمز عن السرّ: رمزٌ قصير يُقرأ ويُكتب، يُبدَّل مرة
-- واحدة بسرٍّ طويل يبقى في الجهاز. فالقِصَر لا يُضعف شيئاً -- عمر
-- الرمز عشر دقائق، ويموت عند أول استعمال، ولا يُقبل إلا من يعرف رابط
-- المتجر أصلاً.
--
-- ولا بدّ من سهولة إعادة الاقتران، لا من منع انفكاكه: السرّ في
-- localStorage، وسفاري iOS تحذف تخزين المواقع بعد سبعة أيام بلا
-- استعمال. فالشاشة التي تُطفأ أسبوعاً تعود مجهولة، ولا حيلة في ذلك
-- إلا أن تُعاد بست خانات في نصف دقيقة.

alter table display_devices
  add column if not exists pairing_code text,
  add column if not exists pairing_expires_at timestamptz,
  add column if not exists paired_at timestamptz,
  /** ما يقوله المتصفح عن نفسه -- ليعرف المالك أي جهاز هذا. */
  add column if not exists user_agent text;

create unique index if not exists display_devices_pairing_code
  on display_devices(pairing_code) where pairing_code is not null;

/**
 * أبجدية بلا التباس.
 *
 * بلا 0/O ولا 1/I/L: من يقرأ من شاشة ويكتب في أخرى يخلط بينها، ثم
 * يظنّ العطل في النظام. وثلاثة وثلاثون حرفاً في ست خانات = نحو 1.3
 * مليار احتمال، تموت كلها بعد عشر دقائق.
 */
create or replace function generate_display_pairing_code()
returns text
language plpgsql
as $gen$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..6 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return substr(out, 1, 3) || '-' || substr(out, 4, 3);
end;
$gen$;

/**
 * ينشئ شاشة جديدة برمز قصير، أو يجدّد رمز شاشة قائمة.
 *
 * والتجديد لا يُنشئ صفاً ثانياً: الشاشة التي فقدت سرّها بعد أسبوع
 * إجازة هي الشاشة نفسها، لا شاشة جديدة تتراكم في القائمة.
 */
create or replace function create_display_pairing_code(p_device_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $mk$
declare
  v_business_id bigint;
  v_code text;
  v_id bigint;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('settings:edit') then
    return null;
  end if;

  -- محاولاتٌ قليلة تكفي: التصادم في مليار احتمال نادر، والفهرس الفريد
  -- يمنعه على كل حال.
  for i in 1..5 loop
    v_code := generate_display_pairing_code();
    exit when not exists (select 1 from display_devices where pairing_code = v_code);
  end loop;

  if p_device_id is not null then
    update display_devices
    set pairing_code = v_code, pairing_expires_at = now() + interval '10 minutes'
    where id = p_device_id and business_id = v_business_id
    returning id into v_id;
  else
    insert into display_devices (business_id, device_secret, label, pairing_code, pairing_expires_at)
    -- سرٌّ من معرّفين عشوائيين لا من gen_random_bytes.
    --
    -- تلك من إضافة pgcrypto، وهي في Supabase تسكن سكيما extensions --
    -- ودوالُّنا search_path لها public وحدها (وهو الصواب: مسارٌ واسع في
    -- دالّةٍ security definer بابُ اختطاف). فتُردّ "does not exist"
    -- ويسقط الملف كلُّه.
    --
    -- وgen_random_uuid في نواة PostgreSQL منذ الإصدار 13، بلا إضافة.
    -- واثنان منها أربعةٌ وستون حرفاً ست عشرية -- أطول مما كان، وبنفس
    -- مصدر العشوائية.
    values (v_business_id, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'شاشة عميل', v_code, now() + interval '10 minutes')
    returning id into v_id;
  end if;

  if v_id is null then return null; end if;
  return jsonb_build_object('id', v_id, 'code', v_code, 'expiresInMinutes', 10);
end;
$mk$;

revoke all on function create_display_pairing_code(bigint) from public, anon;
grant execute on function create_display_pairing_code(bigint) to authenticated;

/**
 * تبديل الرمز القصير بالسرّ الطويل.
 *
 * تُنادى من الشاشة بلا جلسة: الجهاز لا يسجّل دخول أحد، وإنما يثبت أنه
 * يحمل رمزاً أعطاه المالك قبل دقائق. والرمز يُبطَل في الجملة نفسها --
 * فلا يُبدَّل مرتين، ولا يُخمَّن على مهل.
 */
create or replace function redeem_display_pairing_code(p_code text, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $use$
declare
  v_secret text;
  v_slug text;
  v_label text;
begin
  update display_devices d
  set pairing_code = null,
      pairing_expires_at = null,
      paired_at = now(),
      last_seen_at = now(),
      user_agent = coalesce(left(p_user_agent, 300), d.user_agent)
  from businesses b
  where d.business_id = b.id
    and d.pairing_code = upper(trim(p_code))
    and d.pairing_expires_at > now()
  returning d.device_secret, b.online_menu_slug, d.label
  into v_secret, v_slug, v_label;

  if v_secret is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;
  return jsonb_build_object('ok', true, 'secret', v_secret, 'slug', v_slug, 'label', v_label);
end;
$use$;

revoke all on function redeem_display_pairing_code(text, text) from public;
grant execute on function redeem_display_pairing_code(text, text) to anon, authenticated;

/** نبضة الشاشة: يعرف بها المالك أيّها حيٌّ وأيّها انقطع. */
create or replace function touch_display_device(p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $touch$
begin
  update display_devices set last_seen_at = now() where device_secret = p_secret;
end;
$touch$;

revoke all on function touch_display_device(text) from public;
grant execute on function touch_display_device(text) to anon, authenticated;
