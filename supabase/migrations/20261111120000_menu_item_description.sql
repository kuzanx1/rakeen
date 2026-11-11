-- وصف المنتج (اختياري): عربي وإنجليزي، يظهر للزبون في المتجر الإلكتروني بس
-- (سطر تحت الاسم، وكامل لما يفتح الصنف). ما يظهر في الكاشير.
-- الكود ما يعتمد عليه (استعلام مستقل + حفظ مشروط)، فالنشر آمن قبل تشغيل هذا الملف.
alter table menu_items add column if not exists description text
  check (description is null or char_length(description) <= 300);
alter table menu_items add column if not exists description_en text
  check (description_en is null or char_length(description_en) <= 300);
