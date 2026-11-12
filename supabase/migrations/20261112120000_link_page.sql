-- «روابطك» -- صفحة روابط المطعم (link in bio): واتساب، المنيو، الموقع،
-- السوشال، تطبيقات التوصيل... بثلاثة تصاميم، كل تصميم بخياراته.
-- ميزة باقتي «عماد» و«صرح» (نفس lib/plans.ts -- plans-matrix-sync يرسب لو اختلفا).
--
-- الملف يُعاد تشغيله بأمان. businesses جدول ساخن: lock_timeout قصير، ولو
-- طلع خطأ قفل أعد تشغيله.

set lock_timeout = '4s';

-- 1) إعدادات الصفحة كاملة (التصميم، الروابط، الخيارات) في عمود واحد.
--    الكود ما يعتمد عليه قبل التشغيل: الاستعلامات تفشل بصمت.
alter table businesses add column if not exists link_page jsonb;

-- 2) «link_page» يدخل عماد وصرح.
create or replace function rk_plan_features(p_plan text)
returns text[]
language sql
immutable
as $fn$
  select case p_plan
    when 'asas' then array['pos','zatca_invoice','offline','shift_close']
    when 'emad' then array['pos','zatca_invoice','offline','shift_close',
                           'kds','inventory','purchases_scan','costing_profit','reports',
                           'loyalty','tables_reservations','team_permissions','delivery_apps','pager','link_page']
    when 'sarh' then array['pos','zatca_invoice','offline','shift_close',
                           'kds','inventory','purchases_scan','costing_profit','reports',
                           'loyalty','tables_reservations','team_permissions','delivery_apps','pager','link_page',
                           'online_store','booking_page','multi_branch']
  end;
$fn$;

-- 3) عدّاد الزيارات والضغطات، يوم بيوم. link_id فاضي = زيارة للصفحة.
create table if not exists link_page_hits (
  business_id bigint not null references businesses(id) on delete cascade,
  day date not null,
  link_id text not null default '',
  hits integer not null default 0,
  primary key (business_id, day, link_id)
);
alter table link_page_hits enable row level security;
drop policy if exists link_page_hits_staff_select on link_page_hits;
create policy link_page_hits_staff_select on link_page_hits for select
  using (business_id = current_business_id());
grant select on link_page_hits to authenticated;

-- 4) الصفحة العامة: تقرأ بس لو مفعّلة والباقة تسمح والمطعم شغّال.
--    ما يطلع منها إلا ما يُعرض للزبون.
create or replace function get_link_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'name', b.name,
    'logo', b.logo_url,
    'slug', b.online_menu_slug,
    'store', coalesce(b.online_ordering_enabled, false),
    'booking', coalesce(b.online_booking_enabled, false),
    'page', b.link_page
  )
  from businesses b
  where b.online_menu_slug = lower(p_slug)
    and b.is_active is not false
    and b.link_page is not null
    and coalesce((b.link_page->>'enabled')::boolean, false)
    and (b.allowed_features is null or 'link_page' = any(b.allowed_features))
  limit 1;
$fn$;
revoke all on function get_link_page(text) from public;
grant execute on function get_link_page(text) to anon, authenticated;

create or replace function link_page_hit(p_slug text, p_link text default '')
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id bigint;
  v_link text := coalesce(p_link, '');
begin
  if length(v_link) > 40 or v_link !~ '^[A-Za-z0-9_-]*$' then return; end if;
  select b.id into v_id from businesses b
   where b.online_menu_slug = lower(p_slug)
     and b.is_active is not false
     and coalesce((b.link_page->>'enabled')::boolean, false)
     and (b.allowed_features is null or 'link_page' = any(b.allowed_features))
   limit 1;
  if v_id is null then return; end if;
  insert into link_page_hits (business_id, day, link_id, hits)
  values (v_id, (now() at time zone 'Asia/Riyadh')::date, v_link, 1)
  on conflict (business_id, day, link_id) do update set hits = link_page_hits.hits + 1;
end;
$fn$;
revoke all on function link_page_hit(text, text) from public;
grant execute on function link_page_hit(text, text) to anon, authenticated;

-- 5) كل مطعمٍ عليه باقة: الـtrigger يعيد حساب مزاياه بالمصفوفة الجديدة.
update businesses set plan_tier = plan_tier where plan_tier is not null;
