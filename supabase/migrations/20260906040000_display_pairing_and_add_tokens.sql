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
create or replace function consume_wallet_add_token(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $use$
declare
  v_public uuid;
begin
  update wallet_add_tokens t
  set consumed_at = now()
  from customers c
  where t.token = p_token
    and t.customer_id = c.id
    and t.consumed_at is null
    and t.expires_at > now()
  returning c.public_token into v_public;

  return v_public;  -- null = مصروف، أو منتهٍ، أو لا وجود له.
end;
$use$;

revoke all on function consume_wallet_add_token(uuid) from public, anon;
