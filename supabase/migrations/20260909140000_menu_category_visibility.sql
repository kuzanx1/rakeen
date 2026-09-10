-- إظهار/إخفاء الفئة في الكاشير والمتجر الإلكتروني — نفس فكرة منتج
-- visible_pos / visible_online، لكن على مستوى الفئة.
--
-- الافتراضي true للاثنين → صفر تغيير في السلوك الحالي. الكاشير/المتجر
-- يخفيان تبويب الفئة، ومنتجٌ كل فئاته مخفية على تلك الشاشة يختفي منها
-- (إلا إن كان مشاركًا في فئة أخرى ظاهرة).
--
-- menu_categories عليه أصلًا سياسة SELECT للـanon على مستوى الجدول،
-- فالأعمدة الجديدة تُقرأ من المتجر بلا grant إضافي.

alter table menu_categories
  add column if not exists visible_pos    boolean not null default true,
  add column if not exists visible_online boolean not null default true;
