-- صحّةُ الطباعة: الرقمُ يجينا، ما نطلبه من العميل.
--
-- السببُ المباشر: أمضينا هذه الليلةَ كلَّها نخمّن سرعةَ طابعةٍ لا نملكها.
-- ثلاثةُ أرقامِ تهدئةٍ متعاقبة (٢٤ ثم ٤٨ ثم ٢٧ ك.ب/ث) كلُّها بُنيت على
-- حسابٍ لا على قياس، وآخرُها تبيّن أنّه يُجوّع رأسَ الطابعة بين ٥٤٪
-- و١٤٣٪. ولم نعرف ذلك إلّا من فيديوٍ صوّره المالكُ بجوّاله وحلّلناه
-- إطاراً إطاراً. وهذا ليس طريقةَ عملٍ تتوسّع على مئة مقهى.
--
-- وما نحتاجه رقمان لا أكثر: كم بايتاً في الثانية يبتلعه الكابلُ فعلاً،
-- وهل انقطع إرسالٌ على هذه الطابعة. الأوّلُ يقول «سريعةٌ أو بطيئة» بلا
-- صورةِ شاشة، والثاني يقول «الخربشةُ على وشك أن تقع» قبل أن يراها زبون.
--
-- ولا صفٌّ لكلِّ فاتورة: مقهى واحدٌ يطبع ألفَ ورقةٍ في اليوم، ومئةُ مقهى
-- تعني مئةَ ألفِ صفٍّ يومياً -- وحجمُ القاعدة هو جدارُنا في الخطّة
-- المجّانية لا كلفةُ كلاودفلير. فصفٌّ واحدٌ لكلِّ (منشأة × فرع × جهاز ×
-- طابعة × يوم)، تُجمَع فيه الأعداد. مئتا صفٍّ في اليوم لمئة مقهى.
--
-- والمجاميعُ لا المعدّلات: المعدّلُ لا يُجمَع، والمجموعُ يُجمَع. فنحفظ
-- مجموعَ الملّي ثانية ومجموعَ البايتات، ونقسم عند القراءة.

create table if not exists print_health_daily (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  branch_id bigint references branches(id) on delete set null,
  -- يومُ العمل كما يراه الجهاز، لا يومُ الخادم: الوردياتُ تمتدّ بعد
  -- منتصف الليل، وصفٌّ ينقسم نصفين يُربك القراءة.
  day date not null,
  -- الجهازُ كما يعرّف نفسَه («كاشير ١» أو موديلُ الجهاز) -- ليس معرّفاً
  -- فريداً، إنّما ما يكفي لتمييز جهازَين في فرعٍ واحد.
  device_label text not null default '',
  -- 'usb:1a86:7584' أو '192.168.1.50:9100' أو 'ble:XX'. وهو المفتاحُ
  -- الذي يُنسب إليه الانقطاعُ والتهدئة.
  printer_key text not null default '',
  transport_kind text not null default '' check (transport_kind in ('', 'usb', 'network', 'bluetooth')),
  app_version text not null default '',
  -- العميلان لا يفترقان، وهذا يُظهر أيُّهما: التطبيقُ أو كاشيرُ الويب.
  client text not null default '' check (client in ('', 'app', 'web')),

  jobs_ok int not null default 0,
  jobs_failed int not null default 0,
  -- إرسالٌ انقطع في منتصفه. هذه هي العلامةُ التي تسبق الفواتيرَ
  -- المشفَّرة، وهي الوحيدةُ التي يقدر الجهازُ على رؤيتها.
  truncations int not null default 0,
  -- هل هدّأت هذه الطابعةُ نفسَها (أي وقع انقطاعٌ فاستحقّت التهدئة).
  paced boolean not null default false,

  transport_ms_sum bigint not null default 0,
  transport_ms_max int not null default 0,
  bytes_sum bigint not null default 0,

  last_error text,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);

-- صفٌّ واحدٌ لكلِّ مفتاح. وcoalesce لأنّ null لا يساوي null في فهرسٍ
-- فريد، فجهازٌ بلا فرعٍ كان سيُنشئ صفّاً جديداً مع كلِّ دفعة.
create unique index if not exists print_health_daily_key_idx
  on print_health_daily (business_id, coalesce(branch_id, 0), day, device_label, printer_key);
create index if not exists print_health_daily_day_idx on print_health_daily (day desc);
-- للوحة ركين: «أرِني كلَّ طابعةٍ انقطع عليها إرسالٌ هذا الأسبوع».
create index if not exists print_health_daily_trouble_idx on print_health_daily (day desc)
  where truncations > 0 or jobs_failed > 0 or paced;

alter table print_health_daily enable row level security;

-- المنشأةُ تقرأ صحّةَ طابعاتها هي -- لشاشةِ التشخيص عندها، ولا تكتب:
-- الكتابةُ كلُّها من المسار المشترك بمفتاح الخدمة، فلا يستطيع جهازٌ
-- أن يكتب أرقامَ غيره ولا أن يزوّر أرقامَ نفسه.
-- وتُسقَط أوّلاً لو كانت: الملفُّ يُشغَّل يدوياً، وتشغيلُه مرّتين
-- لا يجوز أن يسقط بـ«موجودةٌ سلفاً».
drop policy if exists print_health_daily_read_own on print_health_daily;
create policy print_health_daily_read_own on print_health_daily for select
  using (business_id = current_business_id());

-- الدفعةُ الواحدة: تُجمَع على الصفِّ الموجود أو تُنشئه.
--
-- وsecurity definer لأنّ الكتابةَ ممنوعةٌ بالسياسة أعلاه. والمنشأةُ
-- تُمرَّر صريحةً لا تُقرأ من auth.uid(): المسارُ يتحقّق من جلسةِ
-- الكاشير بنفسه ثم يستدعي هذه بمفتاح الخدمة، كما يفعل show-pager.
create or replace function record_print_health(
  p_business_id bigint,
  p_branch_id bigint,
  p_day date,
  p_device_label text,
  p_printer_key text,
  p_transport_kind text,
  p_app_version text,
  p_client text,
  p_jobs_ok int,
  p_jobs_failed int,
  p_truncations int,
  p_paced boolean,
  p_transport_ms_sum bigint,
  p_transport_ms_max int,
  p_bytes_sum bigint,
  p_last_error text
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_business_id is null or p_day is null then
    return;
  end if;

  insert into print_health_daily (
    business_id, branch_id, day, device_label, printer_key, transport_kind,
    app_version, client, jobs_ok, jobs_failed, truncations, paced,
    transport_ms_sum, transport_ms_max, bytes_sum, last_error, first_at, last_at
  ) values (
    p_business_id, p_branch_id, p_day,
    coalesce(left(p_device_label, 80), ''), coalesce(left(p_printer_key, 80), ''),
    coalesce(p_transport_kind, ''), coalesce(left(p_app_version, 20), ''), coalesce(p_client, ''),
    greatest(coalesce(p_jobs_ok, 0), 0), greatest(coalesce(p_jobs_failed, 0), 0),
    greatest(coalesce(p_truncations, 0), 0), coalesce(p_paced, false),
    greatest(coalesce(p_transport_ms_sum, 0), 0), greatest(coalesce(p_transport_ms_max, 0), 0),
    greatest(coalesce(p_bytes_sum, 0), 0), left(p_last_error, 200), now(), now()
  )
  on conflict (business_id, coalesce(branch_id, 0), day, device_label, printer_key)
  do update set
    jobs_ok          = print_health_daily.jobs_ok + excluded.jobs_ok,
    jobs_failed      = print_health_daily.jobs_failed + excluded.jobs_failed,
    truncations      = print_health_daily.truncations + excluded.truncations,
    -- التهدئةُ لا تُرفَع عن طابعةٍ استحقّتها في اليوم نفسِه: دفعةٌ لاحقةٌ
    -- تقول false لأنّ التطبيقَ أُعيد فتحُه، وذلك لا يُلغي أنّها وقعت.
    paced            = print_health_daily.paced or excluded.paced,
    transport_ms_sum = print_health_daily.transport_ms_sum + excluded.transport_ms_sum,
    transport_ms_max = greatest(print_health_daily.transport_ms_max, excluded.transport_ms_max),
    bytes_sum        = print_health_daily.bytes_sum + excluded.bytes_sum,
    app_version      = excluded.app_version,
    transport_kind   = excluded.transport_kind,
    last_error       = coalesce(excluded.last_error, print_health_daily.last_error),
    last_at          = now();
end
$fn$;

revoke all on function record_print_health(bigint, bigint, date, text, text, text, text, text, int, int, int, boolean, bigint, int, bigint, text) from public, anon, authenticated;
grant execute on function record_print_health(bigint, bigint, date, text, text, text, text, text, int, int, int, boolean, bigint, int, bigint, text) to service_role;
