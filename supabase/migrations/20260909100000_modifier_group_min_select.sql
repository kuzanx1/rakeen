-- مجموعات الخيارات: «إلزامية أو لا» صارت حقلاً حقيقيًا
--
-- المشكلة: كان الكاشير (ويب + تطبيق) يفترض «كل مجموعة single = إلزامية»
-- (required = g.type === 'single')، والمخطط ما فيه أي حقل يقول هل المجموعة
-- إلزامية. فمنتج فيه مجموعتين single (نوع الحليب + مستوى السكر) يفتح نافذة
-- تخصيص إجبارية ويحسّها صاحب المطعم «لازم يختار من الاثنين».
--
-- الحل: عمود min_select. 0 = اختيارية (تقدر تضيف بدون اختيار)، ≥1 = لازم
-- يختار هذا العدد على الأقل. الكاشير يقرأ required = min_select > 0.
--
-- backfill: min_select = 1 لكل مجموعة single موجودة الآن → صفر تغيير في
-- السلوك الحالي. صاحب المطعم يخفّضها لصفر للمجموعات اللي يبيها اختيارية من
-- شاشة «الخيارات والإضافات» بلوحة التحكم. المجموعات الجديدة تُنشأ بـ0
-- (اختيارية) افتراضيًا.
--
-- كتلة واحدة. modifier_groups جدول صغير، وset lock_timeout حول الـALTER.

set lock_timeout = '3s';

alter table modifier_groups
  add column if not exists min_select int not null default 0;

do $$ begin
  alter table modifier_groups add constraint modifier_groups_min_select_check
    check (min_select >= 0 and min_select <= max_select);
exception when duplicate_object then null;
end $$;

update modifier_groups set min_select = 1
  where type = 'single' and min_select = 0 and max_select >= 1;

reset lock_timeout;
