-- ورقة الموازنة كاملة مع تقرير الإغلاق.
--
-- shift_closing_reports كان فيه الأرقام الموقّعة بس (المتوقع، المعدود، الفرق...)،
-- والورقة صار فيها أسطر أكثر (الإجمالي، الخصومات، الصافي، الافتتاحي...).
-- «طباعة آخر موازنة» كانت تبني الورقة من الأعمدة فتطلع ناقصة ويرمي محرّك
-- الطباعة. الحين الكاشير (التطبيق والويب) يحفظ الورقة نفسها هنا، وإعادة
-- الطباعة تطبعها كما هي. التقارير القديمة (report = null) تنحسب من طلبات
-- الوردية.
begin;
set local lock_timeout = '5s';
alter table public.shift_closing_reports add column if not exists report jsonb;
comment on column public.shift_closing_reports.report is
  'ورقة الموازنة كاملة كما انطبعت وقت الإغلاق (ClosingReport) — لإعادة الطباعة.';
commit;
