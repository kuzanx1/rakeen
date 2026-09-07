-- ============================================================
--  شاشة العميل واقتران الأجهزة -- كل ما ينقص القاعدة
-- ============================================================
--
-- جُمِع من أربع مهاجرات. وسببُ جمعها هو سببُ جمع ملف المحفظة: كانت
-- تُرسَل واحدةً واحدة، فتُشغَّل بعضها ويُنسى بعض -- ورسالةُ "الدالّة
-- غير موجودة" لا تدلّ على أيّها نُسي.
--
-- والترتيب لازم: الجداول أولاً، ثم الأعمدة عليها، ثم الدوالّ. وكلٌّ
-- منها if not exists أو create or replace، فإعادة تشغيله لا تضرّ.
--
-- وسياسات RLS تُسقَط قبل أن تُنشأ: create policy لا يقبل if not exists،
-- وسياسةٌ موجودة تُفشل سطرها -- والملف معاملةٌ واحدة، فيسقط ما بعده
-- كلُّه. وهذا ما حدث في أول تشغيل: نُشئت الجداول ولم تُنشأ الدوالّ،
-- فقيل "الدالّة غير موجودة" ولا شيء يدلّ على السطر الذي وقف عنده.
--
-- وcreate_wallet_add_token تُعرَّف ثلاث مرّات هنا -- والأخيرة تسود،
-- وهي التي تقول سبب امتناعها بدل أن تصمت.
-- ============================================================

-- ملاحظة: تُسقَط الدوالّ قبل إنشائها.
--
-- create or replace لا يغيّر نوع الإرجاع: أول نسخةٍ من
-- create_wallet_add_token كانت تُرجع uuid ثم صارت jsonb، فيردّ المخزن
-- "cannot change return type" ويسقط الملف كلُّه -- وهو معاملةٌ واحدة.
-- والإسقاط قبلها يجعل كلّ نسخةٍ تحلّ محلّ ما قبلها بلا أن تسأل عن نوعه.

-- شاشة العميل: جهازٌ مقترن، ورمزٌ يُصرف مرة.
--
-- شاشة المنيو تعرض للعميل باركوداً يضيف به بطاقة ولائه. وفيها خطران
-- مختلفان لا يعالجهما شيء واحد:
--
--   1. الزبون التالي في الطابور يمسح باركود الذي قبله. وهذا لا يعالجه
--      وقتٌ قصير -- الطابور أسرع من أي مهلة -- بل يعالجه أن يُصرف
--      الرمز مرة واحدة: أول مسح يقتله، فما بعده لا يجد شيئاً.
--
--   2. جهازٌ آخر فتح الصفحة نفسها. والصفحة قناةٌ حيّة: من ملك رابطها
--      انضمّ إليها ورأى كل باركود يمرّ فيها، لا باركوداً واحداً. وهذا
--      لا يعالجه أن يُصرف الرمز مرة، بل أن تُقفل القناة على جهاز
--      بعينه -- فلا يصل إلى غيره أصلاً.
--
-- فالأول رمزٌ يُستهلك، والثاني جهازٌ يُقترن. وكلاهما هنا.

-- ============ الجهاز المقترن ============
--
-- شاشةٌ واحدة لكل فرع: هي التي أمام العميل. والاقتران برمزٍ يُنشئه
-- المالك من لوحة التحكم ويُدخله في الشاشة مرة، فتحفظه وتُعرَف به.
create table if not exists display_devices (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  branch_id bigint references branches(id) on delete cascade,
  /** ما تحفظه الشاشة وتُرسله مع كل استماع. سرٌّ لا معرّف. */
  device_secret text not null,
  label text not null default 'شاشة العميل',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists display_devices_secret on display_devices(device_secret);
create index if not exists display_devices_business on display_devices(business_id, branch_id);

alter table display_devices enable row level security;

drop policy if exists display_devices_read on display_devices;
create policy display_devices_read on display_devices
  for select using (business_id = current_business_id());

drop policy if exists display_devices_write on display_devices;
create policy display_devices_write on display_devices
  for all using (business_id = current_business_id() and has_permission('settings:edit'))
  with check (business_id = current_business_id() and has_permission('settings:edit'));

-- ============ نصّ الدعوة على الشاشة ============
--
-- يكتبه صاحب المطعم بلسانه: "بالعافية عليك" ليست عبارةً واحدة تصلح
-- لمقهى ومطعم ومخبز، ولا هي بلهجة كل مدينة.
alter table businesses
  add column if not exists display_barcode_message text
  not null default 'بالعافية عليك — امسح الباركود وصير من خلّاننا';

comment on column businesses.display_barcode_message is
  'النص المعروض فوق باركود الولاء على شاشة العميل.';

-- ============ رمز الإضافة: يُصرف مرة ============
--
-- ليس public_token: ذاك دائم، ومن صوّره ملك البطاقة إلى الأبد. وهذا
-- يُنشأ للحظته، ويموت عند أول استعمال أو بانقضاء مهلته -- أيّهما أسبق.
create table if not exists wallet_add_tokens (
  token uuid primary key default gen_random_uuid(),
  customer_id bigint not null references customers(id) on delete cascade,
  business_id bigint not null references businesses(id) on delete cascade,
  /** الشاشة التي عُرض عليها. رمزٌ عُرض على شاشةٍ لا يُصرف من غيرها. */
  display_device_id bigint references display_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists wallet_add_tokens_customer on wallet_add_tokens(customer_id);
create index if not exists wallet_add_tokens_expiry on wallet_add_tokens(expires_at);

alter table wallet_add_tokens enable row level security;
-- لا سياسة قراءة: لا يُقرأ إلا بمفتاح الخدمة من مسار الإضافة. ومن قرأ
-- الرمز ملك البطاقة، فلا يُعرض لأحد -- ولا للكاشير نفسه.

/**
 * ينشئ رمز إضافة للعرض على الشاشة.
 *
 * دقيقتان لا خمس عشرة ثانية: الأمان من أنه يُصرف مرة، لا من قصره.
 * وخمس عشرة ثانية تُربك العميل وهو يخرج جواله، ولا تمنع من صوّر
 * الشاشة -- التصوير أسرع منها على كل حال.
 */
drop function if exists create_wallet_add_token(bigint, bigint);
create or replace function create_wallet_add_token(
  p_customer_id bigint,
  p_display_device_id bigint default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $mk$
declare
  v_business_id bigint;
  v_token uuid;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('pos:register') then
    return null;
  end if;
  if not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    return null;
  end if;

  -- رموز هذا الزبون السابقة تموت: العميل يطلبها ثانيةً لأن الأولى لم
  -- تنفع، فبقاؤها حيّةً يترك على الشاشة ما لم يعد يُقصد.
  update wallet_add_tokens
  set consumed_at = now()
  where customer_id = p_customer_id and consumed_at is null and expires_at > now();

  insert into wallet_add_tokens (customer_id, business_id, display_device_id, expires_at)
  values (p_customer_id, v_business_id, p_display_device_id, now() + interval '2 minutes')
  returning token into v_token;

  return v_token;
end;
$mk$;

revoke all on function create_wallet_add_token(bigint, bigint) from public, anon;
grant execute on function create_wallet_add_token(bigint, bigint) to authenticated;

/**
 * يصرف الرمز ويردّ رمز الزبون الدائم.
 *
 * والصرف والفحص في جملةٍ واحدة: لو قُرئ ثم كُتب، لمرّ بينهما مسحٌ ثانٍ
 * -- وهو بالضبط ما يقع حين يمسح اثنان الشاشة في اللحظة نفسها.
 */
drop function if exists consume_wallet_add_token(uuid);
create or replace function consume_wallet_add_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $use$
declare
  v_public uuid;
  v_display bigint;
begin
  update wallet_add_tokens t
  set consumed_at = now()
  from customers c
  where t.token = p_token
    and t.customer_id = c.id
    and t.consumed_at is null
    and t.expires_at > now()
  returning c.public_token, t.display_device_id into v_public, v_display;

  if v_public is null then
    return null;  -- مصروف، أو منتهٍ، أو لا وجود له.
  end if;

  -- ورقم الشاشة معه: الخادم يخبرها فتُخفي الباركود في اللحظة، فلا
  -- يقعد على وجهها يحجب المنيو عن الزبون التالي لدقيقتين وقد أُخذ.
  return jsonb_build_object('publicToken', v_public, 'displayDeviceId', v_display);
end;
$use$;

revoke all on function consume_wallet_add_token(uuid) from public, anon;

-- قناةٌ يسمعها الكاشير حين يُمسح الباركود.
--
-- الباركود يُعرض على شاشة العميل، ونافذةُ نجاح الطلب باقيةٌ أمام
-- الكاشير حتى يغلقها. فإذا مسحه العميل فقد انتهى الطلب كله -- الفاتورة
-- طُبعت، والبطاقة أُضيفت -- ولا معنى لبقاء النافذة تنتظر ضغطة.
--
-- والخادم يعرف اللحظة: هو الذي يصرف الرمز. فيبقى أن يجد قناةً يخبر
-- بها الكاشير.
--
-- ولا تكون قناةَ الشاشة: سرُّها لا يُسلَّم للمتصفح، ومن ملكه استمع إلى
-- كل باركود يمرّ عليها. فمعرّفٌ عابر يُولد مع الرمز، يُعطى للكاشير
-- وحده، ويموت بموت الرمز -- يسمع به نتيجةَ عرضه هو، لا شيئاً سواها.
alter table wallet_add_tokens
  add column if not exists pos_session uuid not null default gen_random_uuid();

comment on column wallet_add_tokens.pos_session is
  'قناة يستمع إليها الكاشير الذي عرض هذا الباركود، ليُغلق نافذته حين يُمسح.';

-- يُرجَع مع الرمز ليعطيه المسار للكاشير.
drop function if exists create_wallet_add_token(bigint, bigint);
create or replace function create_wallet_add_token(
  p_customer_id bigint,
  p_display_device_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $mk$
declare
  v_business_id bigint;
  v_token uuid;
  v_session uuid;
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('pos:register') then
    return null;
  end if;
  if not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    return null;
  end if;

  -- رموز هذا الزبون السابقة تموت: العميل يطلبها ثانيةً لأن الأولى لم
  -- تنفع، فبقاؤها حيّةً يترك على الشاشة ما لم يعد يُقصد.
  update wallet_add_tokens
  set consumed_at = now()
  where customer_id = p_customer_id and consumed_at is null and expires_at > now();

  insert into wallet_add_tokens (customer_id, business_id, display_device_id, expires_at)
  values (p_customer_id, v_business_id, p_display_device_id, now() + interval '2 minutes')
  returning token, pos_session into v_token, v_session;

  return jsonb_build_object('token', v_token, 'posSession', v_session);
end;
$mk$;

revoke all on function create_wallet_add_token(bigint, bigint) from public, anon;
grant execute on function create_wallet_add_token(bigint, bigint) to authenticated;

-- ويُرجَع عند الصرف ليُبثّ إليه.
drop function if exists consume_wallet_add_token(uuid);
create or replace function consume_wallet_add_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $use$
declare
  v_public uuid;
  v_display bigint;
  v_session uuid;
begin
  update wallet_add_tokens t
  set consumed_at = now()
  from customers c
  where t.token = p_token
    and t.customer_id = c.id
    and t.consumed_at is null
    and t.expires_at > now()
  returning c.public_token, t.display_device_id, t.pos_session
  into v_public, v_display, v_session;

  if v_public is null then
    return null;  -- مصروف، أو منتهٍ، أو لا وجود له.
  end if;

  return jsonb_build_object(
    'publicToken', v_public,
    'displayDeviceId', v_display,
    'posSession', v_session
  );
end;
$use$;

revoke all on function consume_wallet_add_token(uuid) from public, anon;

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
drop function if exists generate_display_pairing_code();
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
drop function if exists create_display_pairing_code(bigint);
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
drop function if exists redeem_display_pairing_code(text, text);
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
drop function if exists touch_display_device(text);
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

-- رمز الإضافة يقول لماذا امتنع.
--
-- كان يردّ null في ثلاث حالاتٍ مختلفة -- جلسةٌ بلا منشأة، وصلاحيةٌ
-- ناقصة، وزبونٌ من منشأةٍ أخرى -- فيقرأها المسار واحدةً ويقول للكاشير
-- "تعذر إنشاء الباركود". وهي جملةٌ لا تدلّ على شيء: لا الكاشير يعرف
-- ماذا يفعل، ولا من يُسأل بعده يعرف من أين يبدأ.
--
-- والسبب يُعاد بمفتاحٍ لا بنصّ: النصّ يُعرَّب في المسار، والمفتاح
-- يبقى واحداً مهما تغيّرت العبارة.
drop function if exists create_wallet_add_token(bigint, bigint);
create or replace function create_wallet_add_token(
  p_customer_id bigint,
  p_display_device_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $mk$
declare
  v_business_id bigint;
  v_token uuid;
  v_session uuid;
begin
  v_business_id := current_business_id();
  if v_business_id is null then
    return jsonb_build_object('error', 'no_business');
  end if;
  if not has_permission('pos:register') then
    return jsonb_build_object('error', 'no_permission');
  end if;
  if not exists (select 1 from customers where id = p_customer_id and business_id = v_business_id) then
    return jsonb_build_object('error', 'customer_not_found');
  end if;

  -- رموز هذا الزبون السابقة تموت: العميل يطلبها ثانيةً لأن الأولى لم
  -- تنفع، فبقاؤها حيّةً يترك على الشاشة ما لم يعد يُقصد.
  update wallet_add_tokens
  set consumed_at = now()
  where customer_id = p_customer_id and consumed_at is null and expires_at > now();

  insert into wallet_add_tokens (customer_id, business_id, display_device_id, expires_at)
  values (p_customer_id, v_business_id, p_display_device_id, now() + interval '2 minutes')
  returning token, pos_session into v_token, v_session;

  return jsonb_build_object('token', v_token, 'posSession', v_session);
end;
$mk$;

revoke all on function create_wallet_add_token(bigint, bigint) from public, anon;
grant execute on function create_wallet_add_token(bigint, bigint) to authenticated;
