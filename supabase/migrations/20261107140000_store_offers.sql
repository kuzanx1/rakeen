-- عروض المتجر الإلكتروني: شريط بطاقات عروض فوق المنيو.
--
-- جدول جديد فقط، ما فيه ALTER على جدول مزدحم. لو ما رُحّل، المتجر
-- يتجاهل الاستعلام (استعلام مستقل)، واللوحة تخفي القسم.
-- اللوحة تكتب، والمتجر والمنيو الإلكتروني (زائر مجهول) يقرؤون النشط فقط.

create table if not exists store_offers (
  id           bigint generated always as identity primary key,
  business_id  bigint not null references businesses(id) on delete cascade,
  title        text   not null check (char_length(title) between 1 and 60),
  subtitle     text            check (subtitle is null or char_length(subtitle) <= 140),
  badge        text            check (badge is null or char_length(badge) <= 24),
  image_url    text,
  menu_item_id bigint references menu_items(id) on delete set null,
  active       boolean not null default true,
  sort_order   integer not null default 0,
  ends_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists store_offers_business_idx on store_offers(business_id, sort_order);

alter table store_offers enable row level security;

-- اللوحة: قراءة وكتابة لصاحب الصلاحية
drop policy if exists store_offers_staff_select on store_offers;
create policy store_offers_staff_select on store_offers for select
  using (business_id = current_business_id()
         and (has_permission('screen:menu') or has_permission('screen:settings')));

drop policy if exists store_offers_staff_insert on store_offers;
create policy store_offers_staff_insert on store_offers for insert
  with check (business_id = current_business_id()
              and (has_permission('screen:menu') or has_permission('screen:settings')));

drop policy if exists store_offers_staff_update on store_offers;
create policy store_offers_staff_update on store_offers for update
  using (business_id = current_business_id()
         and (has_permission('screen:menu') or has_permission('screen:settings')))
  with check (business_id = current_business_id());

drop policy if exists store_offers_staff_delete on store_offers;
create policy store_offers_staff_delete on store_offers for delete
  using (business_id = current_business_id()
         and (has_permission('screen:menu') or has_permission('screen:settings')));

-- المتجر: النشط اللي ما انتهى بس
drop policy if exists store_offers_public_read on store_offers;
create policy store_offers_public_read on store_offers for select
  using (active = true and (ends_at is null or ends_at > now()));

grant select on store_offers to anon;
grant select, insert, update, delete on store_offers to authenticated;
