-- إظهار السعرات للزبون: مفتاح للمتجر الإلكتروني ومفتاح للمنيو الإلكتروني (شاشة العرض).
-- افتراضياً ظاهرة. الكود يقرأها باستعلام مستقل، فالنشر آمن قبل تشغيل هذا الملف.
alter table businesses add column if not exists online_show_calories boolean not null default true;
alter table businesses add column if not exists display_show_calories boolean not null default true;
grant select (online_show_calories, display_show_calories) on businesses to anon;
