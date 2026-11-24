-- شريطُ الفاتورة: لكلِّ مطعمٍ رأيٌ في ورقته.
--
-- كان قيمةً واحدةً على مستوى المنصّة: تختارها ركين فتُطبع على فواتير
-- الجميع، والمطعمُ لا يملك تغييرَها ولا رفعَها عن ورقته. وهي ورقتُهم،
-- وفيها شعارُهم فوق الشريط -- فصار الاختيارُ لهم.
--
-- ── ثلاثُ طبقات، كلُّ واحدةٍ تغلب ما تحتها ──
--   ١) ركين تُخفي الميزةَ كلَّها  (platform_settings.receipt_banner = none)
--      فلا شيءَ يُطبع في أيِّ مكان، ويختفي الاختيارُ من لوحات المطاعم.
--   ٢) ركين تختار التصميمَ الافتراضيّ.
--   ٣) والمطعمُ يغيّره لنفسه، أو يرفعه عن ورقته.
--
-- ولا تتغيّر أسماءُ الدوالّ ولا توقيعاتُها: الكاشيران المشحونان
-- (١٫٧٦ و١٫٧٧ وما قبلهما في الويب) ينادون rk_receipt_banner() بلا
-- وسائط، فيبقى النداءُ كما هو ويتغيّر ما خلفه. فالميزةُ تعمل على
-- الأجهزة التي في أيدي الناس الآن، بلا نسخةٍ جديدةٍ من التطبيق.

/**
 * اختيارُ المنشأة. NULL تعني «اتبع ما تختاره ركين» -- وهي حالُ كلِّ
 * مطعمٍ لم يفتح الشاشةَ قطّ، فلا يتغيّر عليه شيءٌ بهذا الترحيل.
 */
alter table public.businesses
  add column if not exists receipt_banner text;

comment on column public.businesses.receipt_banner is
  'شريطُ الفاتورة لهذا المطعم: NULL = اتبع المنصّة، none = لا يريده، أو shield/plain/invert.';

/**
 * ما يُطبع فعلاً على ورقةِ هذا الكاشير.
 *
 * ويُحسب في الخادم لا في العميل: الكاشيران يقرآن قيمةً واحدةً جاهزة،
 * فلو تغيّرت القاعدةُ يوماً (طبقةٌ ثالثة، أو مناسبةٌ تنتهي) تغيّرت هنا
 * مرّةً وبلغت الجهازين معاً -- ولا نسخةَ تُبنى ولا تحديثَ يُنتظر.
 *
 * وترتيبُ الغلبة: إخفاءُ ركين أوّلاً، ثمّ اختيارُ المطعم، ثمّ افتراضُ
 * ركين. و«المطعمُ أوّلاً» خطأٌ هنا: لو انتهت المناسبةُ وأرادت ركين
 * إطفاءها، ما جاز أن يبقى مطعمٌ يطبعها شهراً لأنّه اختارها مرّة.
 */
create or replace function public.rk_receipt_banner()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  with platform as (
    select coalesce(
      nullif(trim(both '"' from (value -> 'kind')::text), ''),
      'none'
    ) as kind
    from public.platform_settings
    where key = 'receipt_banner'
  )
  select coalesce(
    (
      select case
        when p.kind = 'none' then 'none'
        else coalesce(nullif(b.receipt_banner, ''), p.kind)
      end
      from platform p
      left join public.businesses b on b.id = current_business_id()
    ),
    'none'
  );
$fn$;

/**
 * ما تختاره ركين وحدَه -- تحتاجه لوحةُ المطعم لا الكاشير.
 *
 * فبه تعرف اللوحةُ أتُظهر شاشةَ الاختيار أصلاً أم لا: ميزةٌ أطفأتها
 * ركين لا تُعرض على المطاعم، فلا يختار أحدٌ شيئاً لا يُطبع.
 */
create or replace function public.rk_receipt_banner_platform()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (
      select nullif(trim(both '"' from (value -> 'kind')::text), '')
      from public.platform_settings
      where key = 'receipt_banner'
    ),
    'none'
  );
$fn$;

revoke all on function public.rk_receipt_banner() from public, anon;
revoke all on function public.rk_receipt_banner_platform() from public, anon;
grant execute on function public.rk_receipt_banner() to authenticated, service_role;
grant execute on function public.rk_receipt_banner_platform() to authenticated, service_role;

/* وعمودٌ جديدٌ في جدولٍ قائم: إن كانت الصلاحيةُ على مستوى الأعمدة لا
   الجدول، لم يرثه أحد. والمنحُ هنا لا يضيّق شيئاً إن كان الجدولُ
   ممنوحاً كلُّه -- والسياساتُ (RLS) هي التي تبقى الحارس: المالكُ
   يعدّل منشأتَه وحدها. */
grant select (receipt_banner), update (receipt_banner) on public.businesses to authenticated;
