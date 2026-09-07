-- النبضة تقول إن كانت الشاشة ما زالت مقترنة.
--
-- كانت تُحدّث last_seen_at وترجع لا شيء. فإن حذف المالك اقترانها --
-- وهو يفعل: يستبدل جهازاً، أو ينظّف قائمةً طالت -- بقي السرّ القديم في
-- ذاكرة متصفّح الجهاز، فيتخطّى شاشة الاقتران ويتصرّف كأنه مقترن. وهو
-- ليس مقترناً: يستمع إلى قناةٍ لا يبثّ فيها أحد، ولا يعرض باركوداً
-- أبداً، ولا يقول لماذا.
--
-- وأسوأ ما فيه أنه يبدو سليماً: صاحب المطعم يرى منيوه على الشاشة
-- فيظنّها تعمل، ويكتشف العطل حين يقف زبونٌ ينتظر باركوداً لا يجيء.
--
-- فتُعيد الآن ما إذا كان الصفّ موجوداً. والجهاز يمسح سرّه ويطلب
-- اقتراناً جديداً حين يُقال له إنه لم يعد معروفاً.
drop function if exists touch_display_device(text);
create or replace function touch_display_device(p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $touch$
declare
  v_id bigint;
begin
  update display_devices set last_seen_at = now()
  where device_secret = p_secret
  returning id into v_id;
  return v_id is not null;
end;
$touch$;

revoke all on function touch_display_device(text) from public;
grant execute on function touch_display_device(text) to anon, authenticated;
