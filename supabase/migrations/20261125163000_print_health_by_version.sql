-- ════════════════════════════════════════════════════════════════════
--  نسخةُ التطبيق تدخل المفتاح -- وإلّا امتزجت النسخُ في صفٍّ واحد
-- ════════════════════════════════════════════════════════════════════
--
--  الصفُّ كان: (مطعم، فرع، يوم، جهاز، طابعة). والنسخةُ عمودٌ عاديّ
--  يُكتب عليه آخرُ ما وصل (app_version = excluded.app_version).
--
--  فمطعمٌ حدّث التطبيقَ في منتصف اليوم تمتزج أوراقُه كلُّها في صفٍّ
--  واحدٍ باسم النسخة الأخيرة. وقع هذا اليوم: صفُّ «كباب طارق» يقول
--  ١٫٨٤ و٧٩٫١ ك.ب للورقة، وقياسُ المرمِّز على ٨٣ فاتورةً حقيقيّةً
--  يقول إنّ ١٫٨٤ تُرسل نحو ٤٤. فلا الرقمُ كاذبٌ ولا القياس -- إنّما
--  الصفُّ يجمع أوراقَ ما قبل التحديث وما بعده.
--
--  وهذا يُبطل الشيءَ الذي بُني الجدولُ لأجله: أن نعرف هل نَفَعت نسخةٌ
--  أم ضرّت. فتدخل النسخةُ المفتاحَ، ويصير لكلِّ نسخةٍ صفُّها.
-- ════════════════════════════════════════════════════════════════════

drop index if exists print_health_daily_key_idx;

create unique index if not exists print_health_daily_key_idx
  on print_health_daily (business_id, coalesce(branch_id, 0), day, device_label, printer_key, app_version);

create or replace function record_print_health(
  p_business_id bigint,
  p_branch_id bigint,
  p_day date,
  p_device_label text,
  p_printer_key text,
  p_transport_kind text,
  p_app_version text,
  p_client text,
  p_jobs_ok int,
  p_jobs_failed int,
  p_truncations int,
  p_paced boolean,
  p_transport_ms_sum bigint,
  p_transport_ms_max int,
  p_bytes_sum bigint,
  p_last_error text
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_business_id is null or p_day is null then
    return;
  end if;

  insert into print_health_daily (
    business_id, branch_id, day, device_label, printer_key, transport_kind,
    app_version, client, jobs_ok, jobs_failed, truncations, paced,
    transport_ms_sum, transport_ms_max, bytes_sum, last_error, first_at, last_at
  ) values (
    p_business_id, p_branch_id, p_day,
    coalesce(left(p_device_label, 80), ''), coalesce(left(p_printer_key, 80), ''),
    coalesce(p_transport_kind, ''), coalesce(left(p_app_version, 20), ''), coalesce(p_client, ''),
    greatest(coalesce(p_jobs_ok, 0), 0), greatest(coalesce(p_jobs_failed, 0), 0),
    greatest(coalesce(p_truncations, 0), 0), coalesce(p_paced, false),
    greatest(coalesce(p_transport_ms_sum, 0), 0), greatest(coalesce(p_transport_ms_max, 0), 0),
    greatest(coalesce(p_bytes_sum, 0), 0), left(p_last_error, 200), now(), now()
  )
  on conflict (business_id, coalesce(branch_id, 0), day, device_label, printer_key, app_version)
  do update set
    jobs_ok          = print_health_daily.jobs_ok + excluded.jobs_ok,
    jobs_failed      = print_health_daily.jobs_failed + excluded.jobs_failed,
    truncations      = print_health_daily.truncations + excluded.truncations,
    -- التهدئةُ لا تُرفَع عن طابعةٍ استحقّتها في اليوم نفسِه: دفعةٌ لاحقةٌ
    -- تقول false لأنّ التطبيقَ أُعيد فتحُه، وذلك لا يُلغي أنّها وقعت.
    paced            = print_health_daily.paced or excluded.paced,
    transport_ms_sum = print_health_daily.transport_ms_sum + excluded.transport_ms_sum,
    transport_ms_max = greatest(print_health_daily.transport_ms_max, excluded.transport_ms_max),
    bytes_sum        = print_health_daily.bytes_sum + excluded.bytes_sum,
    -- والنسخةُ لم تعد تُكتب هنا: صارت جزءاً من المفتاح نفسِه.
    transport_kind   = excluded.transport_kind,
    last_error       = coalesce(excluded.last_error, print_health_daily.last_error),
    last_at          = now();
end
$fn$;

revoke all on function record_print_health(bigint, bigint, date, text, text, text, text, text, int, int, int, boolean, bigint, int, bigint, text) from public, anon, authenticated;
grant execute on function record_print_health(bigint, bigint, date, text, text, text, text, text, int, int, int, boolean, bigint, int, bigint, text) to service_role;
