-- شريطُ الفاتورة الوطنيّ: ميزةٌ مؤقّتة تُطفأ بزرٍّ من لوحة إدارة ركين.
--
-- والقيمةُ على مستوى المنصّة لا المنشأة: تُكتب مرّةً فتظهر في كلِّ فاتورةٍ
-- في كلِّ مطعم، وتُطفأ مرّةً فتختفي من الورقة التالية في كلِّ مكان -- بلا
-- بناءٍ جديد، وبلا تحديثٍ على الأجهزة، وبلا نشرٍ للموقع.
--
-- وplatform_settings موجودٌ سلفاً (ترحيل 20261006140000) لكنّه ممنوعٌ عن
-- authenticated، وهو الصواب: فيه حسابُ ركين البنكيّ. فلا تُفتح قراءتُه،
-- إنّما تُفتح قيمةٌ واحدةٌ منه بدالّةٍ تقرؤها وحدَها.

insert into public.platform_settings (key, value, updated_by)
values ('receipt_banner', '{"kind": "none"}'::jsonb, 'migration')
on conflict (key) do nothing;

/**
 * أيُّ شريطٍ يُطبع الآن: none أو shield أو plain أو invert.
 *
 * يناديها الكاشيران كلاهما مع بقيّة هويّة الفاتورة، فتُحفظ عندهما مع
 * ما يُحفظ -- والطباعةُ تعمل بلا إنترنت بآخر قيمةٍ وصلت.
 *
 * ولا تُعيد إلّا هذا المفتاح: فتحُ الجدول كلِّه كان سيكشف حساب ركين
 * البنكيّ لكلِّ كاشيرٍ في كلِّ مطعم.
 */
create or replace function public.rk_receipt_banner()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    nullif(trim(both '"' from (value -> 'kind')::text), ''),
    'none'
  )
  from public.platform_settings
  where key = 'receipt_banner';
$fn$;

revoke all on function public.rk_receipt_banner() from public, anon;
grant execute on function public.rk_receipt_banner() to authenticated, service_role;
