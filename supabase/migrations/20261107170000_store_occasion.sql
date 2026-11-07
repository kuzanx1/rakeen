-- مناسبة المتجر: اليوم الوطني، يوم التأسيس، رمضان، العيد، أو مناسبة خاصة.
-- { enabled, preset, title, subtitle, image_url, starts_on, ends_on }
-- المتجر يعرضها بين التاريخين بطابع شكله، واللوحة تكتبها (المناسبات في
-- المتجر الإلكتروني ← التصميم). الاثنين يقرؤونها باستعلام مستقل، فالنشر
-- آمن قبل تشغيل هذا الملف.
alter table businesses add column if not exists online_occasion jsonb not null default '{}'::jsonb;
alter table businesses drop constraint if exists businesses_online_occasion_object;
alter table businesses add constraint businesses_online_occasion_object
  check (jsonb_typeof(online_occasion) = 'object' and pg_column_size(online_occasion) < 2048);

grant select (online_occasion) on businesses to anon;
