-- السعرات الحرارية للمنتج: اختيارية، تظهر للزبون تحت السعر بالمتجر والمنيو الإلكتروني.
-- الكود ما يعتمد عليها (استعلام مستقل + حفظ مشروط)، فالنشر آمن قبل تشغيل هذا الملف.
alter table menu_items add column if not exists calories integer
  check (calories is null or (calories >= 0 and calories <= 5000));
