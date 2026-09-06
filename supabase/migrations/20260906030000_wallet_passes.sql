-- بطاقات المحفظة: أي جهاز يحمل بطاقة أي زبون.
--
-- بطاقة Apple Wallet لا تسأل الخادم عن جديدها. الخادم هو الذي يوقظها:
-- يرسل إشعاراً إلى الجهاز فيطلب الجهاز النسخة المحدّثة. وليفعل ذلك
-- لا بدّ أن يعرف أي الأجهزة تحمل أي بطاقة -- وهذا الجدول.
--
-- والجهاز الواحد يحمل بطاقات لزبائن كثر (جهاز الكاشير مثلاً)، والزبون
-- الواحد يضع بطاقته في أجهزة عدة. فالعلاقة كثيرٌ إلى كثير، ومفتاحها
-- الزوج لا أحدهما.
--
-- ولا يُنشأ الصف إلا حين يضيف صاحب الجهاز البطاقة فعلاً: آبل تنادي
-- نقطة التسجيل من الجهاز نفسه بعد الإضافة، لا نحن.
create table if not exists wallet_pass_registrations (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  business_id bigint not null references businesses(id) on delete cascade,
  /** معرّف مكتبة البطاقات على ذلك الجهاز. تعطيه آبل، ولا يعرّف الجهاز
   *  إلا عندنا -- ليس UDID ولا شيئاً يتتبّع صاحبه. */
  device_library_id text not null,
  /** الرمز الذي يُرسل به الإشعار إلى هذا الجهاز. */
  push_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- الزوج هو المفتاح: إعادة التسجيل تحدّث الرمز ولا تُنشئ صفاً ثانياً.
create unique index if not exists wallet_pass_registrations_pair
  on wallet_pass_registrations(device_library_id, customer_id);
-- ومن هنا يُقرأ: "من يحمل بطاقة هذا الزبون؟" عند كل تغيّر في رصيده.
create index if not exists wallet_pass_registrations_customer
  on wallet_pass_registrations(customer_id);

alter table wallet_pass_registrations enable row level security;

-- لا سياسة تسمح لأحد: هذا الجدول لا يمسّه إلا الخادم بمفتاح الخدمة،
-- ونقاط PassKit تُصادَق بـauthenticationToken الخاص بالبطاقة لا بجلسة
-- مستخدم. وصمتُ السياسات هنا هو المنع، لا سهوٌ عنها.

/**
 * متى تغيّر ما يُعرض على البطاقة.
 *
 * آبل تسأل: "ما الذي تغيّر بعد هذا الوقت؟" فيلزم وقتٌ يُقارَن به. وهو
 * على الزبون لا على التسجيل: البطاقة واحدة وإن حملتها عشرة أجهزة.
 */
alter table customers
  add column if not exists wallet_pass_updated_at timestamptz not null default now();

-- ويتغيّر مع كل ما يظهر على وجه البطاقة -- الرصيد والزيارات والوحدات.
create or replace function touch_wallet_pass_updated_at()
returns trigger
language plpgsql
as $touch$
begin
  if new.loyalty_points is distinct from old.loyalty_points
     or new.loyalty_visits is distinct from old.loyalty_visits
     or new.loyalty_units is distinct from old.loyalty_units
     or new.loyalty_free_rewards is distinct from old.loyalty_free_rewards then
    new.wallet_pass_updated_at := now();
  end if;
  return new;
end;
$touch$;

drop trigger if exists customers_wallet_pass_touch on customers;
create trigger customers_wallet_pass_touch
  before update on customers
  for each row execute function touch_wallet_pass_updated_at();

/**
 * ما تعرضه البطاقة، بمفتاحها العام وحده.
 *
 * تُنادى من مسار الخادم بمفتاح الخدمة بعد أن يتحقق من
 * authenticationToken، فلا تفترض جلسةً ولا صلاحية. وتُرجع ما يُطبع على
 * وجه البطاقة لا أكثر: لا هاتف، ولا اسم موظف، ولا تاريخ ميلاد.
 */
create or replace function get_wallet_pass_data(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $wallet$
declare
  v_out jsonb;
begin
  select jsonb_build_object(
    'customerId', c.id,
    'businessId', b.id,
    'customerName', coalesce(c.name, ''),
    'businessName', coalesce(b.name, 'ركين'),
    'systemType', b.loyalty_system_type,
    'points', c.loyalty_points,
    'visits', c.loyalty_visits,
    'units', c.loyalty_units,
    'freeRewards', c.loyalty_free_rewards,
    'visitsThreshold', b.loyalty_visits_threshold,
    'unitsThreshold', b.loyalty_unit_threshold,
    'rewardLabel', coalesce(b.loyalty_reward_label, 'مكافأة مجانية'),
    'accentColor', coalesce(b.loyalty_accent_color, '#C4FF2B'),
    'tagline', coalesce(b.loyalty_tagline, ''),
    'logoUrl', coalesce(b.loyalty_logo_url, b.logo_url, ''),
    'updatedAt', c.wallet_pass_updated_at,
    'enabled', coalesce(b.loyalty_enabled, true)
  ) into v_out
  from customers c
  join businesses b on b.id = c.business_id
  where c.public_token = p_token;

  return v_out;  -- null حين لا يطابق الرمز أحداً، ويردّها المسار 404.
end;
$wallet$;

revoke all on function get_wallet_pass_data(uuid) from public, anon;
