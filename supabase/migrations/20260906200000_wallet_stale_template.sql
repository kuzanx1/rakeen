-- من بطاقته أقدم من القالب يعود إلى الطابور.
--
-- الطابور يعرف من تغيّر رصيده (wallet_pass_updated_at > pushed_at)،
-- ولا يعرف من تغيّر شكل بطاقته. فبعد كل تعديلٍ في القالب -- حقلٌ نُقل،
-- أو نصٌّ صيغ من جديد -- تبقى بطاقات الزبائن على شكلها القديم إلى أن
-- يشتروا. وقد لا يشترون.
--
-- فتُعاد بطاقاتهم إلى الطابور مرّةً واحدة عند أول دورةٍ بعد التغيير:
-- من دُفع إليه قبل تاريخ القالب لم يرَ الشكل الجديد.
create or replace function wallet_push_stale_template(p_since timestamptz)
returns int
language plpgsql
security definer
set search_path = public
as $stale$
declare v_count int;
begin
  update customers c
  set wallet_pass_pushed_at = null
  where c.wallet_pass_pushed_at is not null
    and c.wallet_pass_pushed_at < p_since
    and exists (select 1 from wallet_pass_registrations r where r.customer_id = c.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$stale$;

revoke all on function wallet_push_stale_template(timestamptz) from public, anon, authenticated;
