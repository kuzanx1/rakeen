-- شكل رابع للمتجر «واجهة» (facade) + خيارات خاصة لكل شكل.
-- online_theme_options = { "folk": {...}, "facade": {...} } — كل شكل
-- بخياراته، فالتبديل بين الأشكال ما يضيّعها. المتجر واللوحة يقرؤونه
-- باستعلام مستقل، فالنشر آمن قبل تشغيل هذا الملف.
alter table businesses drop constraint if exists businesses_online_theme_style_check;
alter table businesses
  add constraint businesses_online_theme_style_check
  check (online_theme_style in ('classic', 'luxury', 'folk', 'facade'));

alter table businesses add column if not exists online_theme_options jsonb not null default '{}'::jsonb;
alter table businesses drop constraint if exists businesses_online_theme_options_object;
alter table businesses add constraint businesses_online_theme_options_object
  check (jsonb_typeof(online_theme_options) = 'object' and pg_column_size(online_theme_options) < 4096);

grant select (online_theme_options) on businesses to anon;
