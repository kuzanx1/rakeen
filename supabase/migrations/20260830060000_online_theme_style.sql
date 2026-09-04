alter table businesses
  add column if not exists online_theme_style text not null default 'classic';

alter table businesses
  add constraint businesses_online_theme_style_check
  check (online_theme_style in ('classic', 'luxury'));
