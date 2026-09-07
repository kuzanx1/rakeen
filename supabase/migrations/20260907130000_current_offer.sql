-- العرضُ الشغّال يُحفظ عند المطعم، لا عند الزبائن وحدهم.
--
-- البثّ يكتب النصّ في بطاقة كل عميل ولا يترك نسخةً عند المنشأة. فلوحةُ
-- التحكم لا تستطيع أن تقول "هذا عرضك الشغّال الآن" -- وصاحب المطعم
-- يبثّ ثم ينسى، فيبقى عرضُ اليوم الوطني على البطاقات في رمضان.
--
-- ولا يُقرأ من customers.wallet_message: ذاك الحقل يحمل غير العرض --
-- رمزَ تأكيدٍ مؤقّتاً، وسؤالَ جودة، وترجيعَ خامل. فقراءتُه قد تُظهر
-- رمز زبونٍ في لوحة صاحب المطعم.
alter table businesses
  add column if not exists wallet_offer_text text,
  add column if not exists wallet_offer_at timestamptz;

comment on column businesses.wallet_offer_text is
  'العرض المبثوث الشغّال الآن على بطاقات العملاء. فارغ = لا عرض.';

create or replace function wallet_broadcast_message(p_text text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id bigint;
  v_count int;
  v_clean text := nullif(btrim(coalesce(p_text, '')), '');
begin
  v_business_id := current_business_id();
  if v_business_id is null or not has_permission('settings:edit') then
    return 0;
  end if;

  update customers c
  set wallet_message = v_clean,
      wallet_message_at = case when v_clean is null then null else now() end,
      wallet_pass_updated_at = now()
  where c.business_id = v_business_id
    and exists (select 1 from wallet_pass_registrations r where r.customer_id = c.id);
  get diagnostics v_count = row_count;

  -- ويُحفظ عند المنشأة سواءٌ وصل زبوناً أو لم يصل: العرض قائمٌ من
  -- لحظة بثّه، ومن أضاف بطاقته بعده يراه في أول تحديث.
  update businesses
  set wallet_offer_text = v_clean,
      wallet_offer_at = case when v_clean is null then null else now() end
  where id = v_business_id;

  return v_count;
end;
$$;
revoke all on function wallet_broadcast_message(text) from public, anon;
grant execute on function wallet_broadcast_message(text) to authenticated;
