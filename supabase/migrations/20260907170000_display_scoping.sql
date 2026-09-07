-- شاشةُ العميل تخصّ فرعاً وكاشيراً بعينه، لا كلَّ من في المشروع.
--
-- العمودُ branch_id قائمٌ منذ أول يوم، ولا شيء يملؤه: دالّةُ الإنشاء لا
-- تسأل عن فرع، فتُخلق كلُّ شاشةٍ بلا فرع. وترشيحُ البثّ يسقط عندها إلى
-- "كلِّ الشاشات" -- فمقهىً بفرعين يعرض باركود زبونٍ هنا على شاشةٍ هناك،
-- ويقف زبونُ الفرع الآخر أمام باركودٍ ليس له.
--
-- والفرعُ وحده لا يكفي: فرعٌ بثلاث نقاطِ بيعٍ وثلاثِ شاشات -- كلُّ
-- كاشيرٍ وشاشتُه أمام زبونه -- يبثّ إلى الثلاث معاً، فيرى ثلاثةُ زبائن
-- باركوداً واحداً ولا يعرف أيُّهم صاحبُه.
--
-- فربطان: الشاشةُ لفرعٍ يختاره المالك، ولنقطةِ بيعٍ يختارها الكاشير من
-- جهازه هو -- فهو وحده يعرف أيَّ شاشةٍ أمامه.
--
-- وشاشةٌ بلا نقطةِ بيعٍ تخدم فرعَها كلَّه: مقهىً بكاشيرٍ واحدٍ وشاشة لا
-- يُسأل عن ربطٍ لا معنى له عنده.

alter table display_devices
  /** معرّفُ نقطة البيع -- يولّده الجهاز ويحفظه، ويُرسله مع كل بثّ. */
  add column if not exists pos_device_id text;

create index if not exists display_devices_pos_device
  on display_devices(business_id, pos_device_id);

/**
 * إنشاءُ شاشةٍ بفرعها -- ولا رمزَ اقترانٍ معها.
 *
 * create_display_pairing_code كانت تُنشئ الصفَّ ومعه رمزٌ قصيرٌ يموت بعد
 * عشر دقائق بلا أن يُستعمل: طريقُ الرمز حُذف من الواجهتين، وبقيت الدالّة
 * تُنادى لأثرها الجانبيّ وحده. وهذي تقول ما تفعل.
 */
create or replace function create_display_device(
  p_branch_id bigint,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $mk$
declare
  v_business_id bigint;
  v_id bigint;
  v_token text;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('settings:edit') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- والفرعُ يُتحقّق أنه فرعُ هذا المشروع: معرّفٌ يجيء من المتصفّح لا
  -- يُؤخذ على علّاته، وإلا رُبطت شاشةٌ بفرع مطعمٍ آخر.
  if p_branch_id is null or not exists (
    select 1 from branches where id = p_branch_id and business_id = v_business_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'bad_branch');
  end if;

  for i in 1..8 loop
    v_token := generate_display_link_token();
    exit when not exists (select 1 from display_devices where link_token = v_token);
  end loop;

  insert into display_devices (business_id, branch_id, device_secret, label, link_token)
  values (
    v_business_id, p_branch_id,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    coalesce(nullif(btrim(p_label), ''), 'شاشة عميل'),
    v_token
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token);
end;
$mk$;

revoke all on function create_display_device(bigint, text) from public, anon;
grant execute on function create_display_device(bigint, text) to authenticated;

/**
 * فرعُ شاشةٍ قائمة يُصحَّح.
 *
 * الشاشاتُ المنشأةُ قبل اليوم كلُّها بلا فرع، ولا يُطلب من المالك أن
 * يحذفها ويعيدها -- الرابطُ مثبَّتٌ على أجهزتها.
 */
create or replace function set_display_device_branch(p_device_id bigint, p_branch_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $setb$
declare
  v_business_id bigint;
  v_id bigint;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('settings:edit') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_branch_id is not null and not exists (
    select 1 from branches where id = p_branch_id and business_id = v_business_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'bad_branch');
  end if;

  update display_devices set branch_id = p_branch_id
  where id = p_device_id and business_id = v_business_id
  returning id into v_id;

  if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$setb$;

revoke all on function set_display_device_branch(bigint, bigint) from public, anon;
grant execute on function set_display_device_branch(bigint, bigint) to authenticated;

/**
 * شاشاتُ فرعي -- يقرؤها الكاشير ليختار التي أمامه.
 *
 * ولا تُرجع السرَّ ولا الرمز: الكاشير يختار، ولا يحتاج ما يفتح به.
 */
create or replace function list_branch_displays(p_branch_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $ls$
declare
  v_business_id bigint;
begin
  v_business_id := current_business_id();
  if v_business_id is null then return jsonb_build_array(); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'label', d.label,
      'posDeviceId', d.pos_device_id,
      'lastSeenAt', d.last_seen_at
    ) order by d.id)
    from display_devices d
    where d.business_id = v_business_id
      and (d.branch_id = p_branch_id or d.branch_id is null)
  ), jsonb_build_array());
end;
$ls$;

revoke all on function list_branch_displays(bigint) from public, anon;
grant execute on function list_branch_displays(bigint) to authenticated;

/**
 * الكاشير يربط الشاشة التي أمامه بجهازه.
 *
 * ومن جهازه هو، لا من لوحة المالك: المالكُ لا يعرف أيُّ شاشةٍ تقف أمام
 * أيِّ نقطةِ بيع -- وهو غالباً ليس في المحلّ أصلاً.
 *
 * والربطُ حصريّ: شاشةٌ لنقطةِ بيعٍ واحدة، فتُنزع أولاً من غيرها. وبلا
 * ذلك تبقى مربوطةً باثنتين فيراها زبونان.
 */
create or replace function claim_display_device(p_device_id bigint, p_pos_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $cl$
declare
  v_business_id bigint;
  v_id bigint;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('pos:use') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- ونقطةُ البيع تُفرَّغ من شاشاتها السابقة: كاشيرٌ بدّل شاشتَه لا يبقى
  -- يبثّ إلى القديمة.
  update display_devices set pos_device_id = null
  where business_id = v_business_id and pos_device_id = p_pos_device_id;

  if p_device_id is null then
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  update display_devices set pos_device_id = p_pos_device_id
  where id = p_device_id and business_id = v_business_id
  returning id into v_id;

  if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$cl$;

revoke all on function claim_display_device(bigint, text) from public, anon;
grant execute on function claim_display_device(bigint, text) to authenticated;
