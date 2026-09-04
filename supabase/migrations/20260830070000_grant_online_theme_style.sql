-- 20260830060000 added businesses.online_theme_style, but anon's SELECT grant
-- on businesses is column-scoped (20260814010000) — a new column needs its
-- own grant, not just a column add, or the storefront's boot() query 42501s
-- for every anon visitor the moment it asks for the new field.
grant select (online_theme_style) on businesses to anon;
