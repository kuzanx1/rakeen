-- منتج في أكثر من فئة — إضافة مضافة بالكامل
--
-- menu_items.category_id يظل «الفئة الأساسية» كما هو، وكل العملاء يقرؤونه
-- زي الحين. هذا الجدول يحمل الفئات الإضافية فقط. المنتج يظهر في فئة لو
-- category_id = X أو (X موجود في menu_item_categories). لو الجدول فاضي →
-- صفر تغيير في السلوك.
--
-- RLS/grants نسخة طبق الأصل من menu_item_modifier_groups (نفس جدول الربط:
-- تكتبه اللوحة، ويقرؤه اللوحة + الكاشير + زائر المتجر المجهول).
-- ما فيه backfill ولا ALTER على جدول مزدحم — create table فقط.


-- ▓▓▓ كتلة ١ من ٣ — الجدول ─────────────────────────────────────────────────
create table if not exists menu_item_categories (
  menu_item_id     bigint not null references menu_items(id)      on delete cascade,
  menu_category_id bigint not null references menu_categories(id) on delete cascade,
  primary key (menu_item_id, menu_category_id)
);
create index if not exists menu_item_categories_item_idx on menu_item_categories(menu_item_id);
create index if not exists menu_item_categories_cat_idx  on menu_item_categories(menu_category_id);


-- ▓▓▓ كتلة ٢ من ٣ — RLS (اللوحة تقرأ/تكتب، الكاشير يقرأ) ───────────────────
alter table menu_item_categories enable row level security;

drop policy if exists menu_item_categories_select on menu_item_categories;
create policy menu_item_categories_select on menu_item_categories for select
  using (exists (
    select 1 from menu_items m
    where m.id = menu_item_categories.menu_item_id
      and m.business_id = current_business_id()
      and (has_permission('screen:menu') or has_permission('pos:register'))
  ));

drop policy if exists menu_item_categories_write on menu_item_categories;
create policy menu_item_categories_write on menu_item_categories for insert
  with check (exists (
    select 1 from menu_items m
    where m.id = menu_item_categories.menu_item_id
      and m.business_id = current_business_id() and has_permission('screen:menu')
  ));

drop policy if exists menu_item_categories_delete on menu_item_categories;
create policy menu_item_categories_delete on menu_item_categories for delete
  using (exists (
    select 1 from menu_items m
    where m.id = menu_item_categories.menu_item_id
      and m.business_id = current_business_id() and has_permission('screen:menu')
  ));


-- ▓▓▓ كتلة ٣ من ٣ — قراءة المتجر الإلكتروني (زائر مجهول) ──────────────────
drop policy if exists menu_item_categories_public_read on menu_item_categories;
create policy menu_item_categories_public_read on menu_item_categories for select
  using (exists (
    select 1 from menu_items m join businesses b on b.id = m.business_id
    where m.id = menu_item_categories.menu_item_id and b.online_ordering_enabled = true
  ));

grant select on menu_item_categories to anon;
