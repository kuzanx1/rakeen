-- أسماء إنجليزية لمجموعات الخيارات وخياراتها -- نفس النمط المستعمل
-- أصلاً بأصناف القائمة وتصنيفاتها (menu_items.name_en، menu_categories.
-- name_en)، لم يكن وصل لهذين الجدولين يوم أُضيف هناك.
--
-- الفراغ (null) آمن: يرجع للعربي فقط تماماً كاليوم -- لا شيء ينكسر
-- لمطعمٍ لم يكتب اسماً إنجليزياً بعد.

alter table modifier_groups add column if not exists name_en text;
alter table modifier_options add column if not exists name_en text;
