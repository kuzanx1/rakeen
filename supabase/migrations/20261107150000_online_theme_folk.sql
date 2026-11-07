-- شكل ثالث لصفحة المتجر: «شعبي» (folk). يُبنى فوق تخطيط «فخم» في
-- rakeen-order.js/css، فهنا بس نوسّع القيد.
alter table businesses drop constraint if exists businesses_online_theme_style_check;
alter table businesses
  add constraint businesses_online_theme_style_check
  check (online_theme_style in ('classic', 'luxury', 'folk'));
