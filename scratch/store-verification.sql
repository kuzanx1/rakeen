-- توثيق ملكية المتجر: ما تطلبه وزارة التجارة قبل شهادة التوثيق.
--
-- منصّة التوثيق تريد دليلاً أن من يدّعي ملكية hbiah.rakeenapp.com يملكها
-- فعلاً، وتقبل ثلاثة أدلّة: سجلّ DNS، أو وسم في ترويسة الصفحة، أو ملفاً
-- في جذر الموقع.
--
-- وسجلّ DNS ليس منهم عندنا: النطاق rakeenapp.com لنا لا لصاحب المطعم،
-- فلا يد له في إعداداته -- وأي "خطوة" نعطيه إياها تنتهي عندنا نحن.
-- يبقى الوسم والملف، وكلاهما يملكه هو: يلصق ما أعطته المنصّة، ونحن
-- نُخرجه في صفحته.
--
-- ويُخزَّن مفكوكاً -- اسمٌ ومحتوى، لا وسمُ HTML كما لُصق. لأن ما يُحفظ
-- نصَّ HTML يُطبع نصَّ HTML، وصفحة المتجر عامّة: من ملك حقلاً في
-- الترويسة ملك الترويسة كلها. والاسم والمحتوى يخرجان سمتين تُهرَّبان،
-- فلا يصير اللصقُ حقنًا مهما كان ما فيه.

alter table businesses
  add column if not exists verification_meta_name text,
  add column if not exists verification_meta_content text,
  add column if not exists verification_file_name text,
  add column if not exists verification_file_content text;

comment on column businesses.verification_meta_name is
  'اسم وسم التحقق (meta name) كما أعطته منصّة التوثيق.';
comment on column businesses.verification_meta_content is
  'قيمة وسم التحقق. تظهر في ترويسة صفحة المتجر ما دامت محفوظة.';
comment on column businesses.verification_file_name is
  'اسم ملف التحقق بجذر الموقع، بامتداد txt. مثال: maroof-1a2b3c.txt';
comment on column businesses.verification_file_content is
  'محتوى ملف التحقق النصّي.';

/**
 * قيودٌ عند الكتابة لا عند القراءة.
 *
 * الملف يُقدَّم من جذر نطاقٍ نتحكّم به، والاسم يصير مساراً. فلو قُبل
 * أي اسم لصار في يد صاحب مطعمٍ واحد أن يحجز robots.txt أو ads.txt --
 * وهي ملفات يقرأها الآخرون على أنها قولُ الموقع نفسه، لا قولُ متجره.
 * ولذلك تُمنع هنا: قاعدةٌ في المخزن أوثق من فحصٍ في المتصفّح، والفحص
 * في المتصفّح يُتجاوَز بطلبٍ مباشر.
 */
alter table businesses drop constraint if exists businesses_verification_file_name_chk;
alter table businesses add constraint businesses_verification_file_name_chk
  check (
    verification_file_name is null
    or (
      verification_file_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,78}\.txt$'
      and lower(verification_file_name) not in (
        'robots.txt', 'ads.txt', 'app-ads.txt', 'security.txt',
        'sitemap.txt', 'humans.txt'
      )
    )
  );

alter table businesses drop constraint if exists businesses_verification_meta_name_chk;
alter table businesses add constraint businesses_verification_meta_name_chk
  check (verification_meta_name is null or verification_meta_name ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{0,78}$');

-- والمحتوى نصٌّ قصير: رمز تحقّق لا صفحة.
alter table businesses drop constraint if exists businesses_verification_len_chk;
alter table businesses add constraint businesses_verification_len_chk
  check (
    coalesce(length(verification_meta_content), 0) <= 500
    and coalesce(length(verification_file_content), 0) <= 2000
  );


/**
 * وتُقرأ بلا تسجيل دخول.
 *
 * زاحفُ المنصّة يفتح الصفحة كما يفتحها أي زائر -- بلا جلسة ولا مفتاح.
 * فلو لم يُمنح anon قراءتها لخرجت الترويسة فارغة، ولفشل التحقق بلا
 * رسالةٍ تدلّ على السبب.
 */
grant select (verification_meta_name, verification_meta_content,
              verification_file_name, verification_file_content)
  on businesses to anon;
