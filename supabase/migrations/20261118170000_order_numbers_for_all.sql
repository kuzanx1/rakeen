-- رقم الطلب الجديد (#١ كل يوم عمل، وأول رقم يختاره الكاشير مع الوردية)
-- شغّال لكل المنشآت، والجديدة تبدأ فيه من أول يوم.
--
-- كان التشغيل منشأة منشأة في order_number_blocks_enabled بدون زر، فبقيت
-- أغلب المحلات على رقم النظام العام (مثل #68497). الجدول يبقى كما هو:
-- كل الدوال تقرأ منه، وحذف صف منه يرجّع منشأة لرقم النظام لو احتجنا.
--
-- الأجهزة تسأل عن الأرقام كل ساعة (أو أول ما ينفتح التطبيق)، فتلقط
-- التشغيل بدون تحديث.

set lock_timeout = '5s';

-- ١) كل المنشآت الحالية
insert into public.order_number_blocks_enabled (business_id)
select b.id from public.businesses b
on conflict (business_id) do nothing;

-- ٢) كل منشأة جديدة
create or replace function public.rk_enable_order_numbers_for_new_business()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_number_blocks_enabled (business_id)
  values (new.id)
  on conflict (business_id) do nothing;
  return new;
end;
$$;

revoke all on function public.rk_enable_order_numbers_for_new_business() from public, anon, authenticated;

drop trigger if exists rk_enable_order_numbers_for_new_business on public.businesses;
create trigger rk_enable_order_numbers_for_new_business
  after insert on public.businesses
  for each row execute function public.rk_enable_order_numbers_for_new_business();

-- تحقق: لازم يطلع نفس العدد
select (select count(*) from public.businesses) as businesses,
       (select count(*) from public.order_number_blocks_enabled) as enabled;
