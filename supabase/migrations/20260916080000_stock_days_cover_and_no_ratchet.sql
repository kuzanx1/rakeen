-- المخزون يُقاس بالأيام لا بالنسبة، والأساس يُشتقّ لا يُخترع.
--
-- ▓ العطل الأول -- القصّ:
--   النسبة كانت تُقصّ عند ١٠٠٪. فمن عبّأ من ٣٣٩ إلى ١٠٠٠ يقرأ ١٠٠٪،
--   ثم ١٠٠٪، ثم ١٠٠٪ لأسابيع حتى ينزل تحت ٣٣٩. شريطٌ جامد يُقرأ على
--   أن المخزون لا ينقص.
--
--   وعالجناه في 20260916040000 بسقّاطة ترفع الأساس مع كل تعبئة. وكان
--   علاجًا لعَرَضٍ لا لسبب: الجمود من القصّ نفسه. فلو عُرض الرقم
--   الحقيقي لكان ٢٩٥٪ ← ٢٨٩٪ ← ٢٧٠٪، يتحرّك من أول بيع.
--
--   وللسقّاطة ضررٌ دائم: ترفع ولا تنزل أبدًا. فطلبيةٌ مضاعفة مرّةً
--   واحدة -- عرضُ مورّد، أو خطأ -- تصير أساسًا إلى الأبد، ويقرأ الرفّ
--   الممتلئ بعدها ٦٠٪ فيرفع تنبيه «قارب على النفاد» وهو ملآن.
--   فتُزال، ويُرفع القصّ في الواجهة، ويُعرض ما فوق ١٠٠٪ كما هو.
--
-- ▓ العطل الثاني -- النسبة تجيب عن السؤال الخطأ:
--   صنفان على ٥٠٪: بنٌّ يُباع منه ٢ كجم يوميًا ينفد بكرة، وشرابٌ
--   يُستهلك منه ١٠٠ مل يوميًا يكفي شهرًا. نفس الرقم، وخطران لا
--   يُقارنان. والسؤال الحقيقي: «كم يومًا يكفيني؟»
--
--   وصار جوابه متاحًا بلا سؤال: stock_movements سجلٌّ حقيقي للاستهلاك.
--
-- ▓ وتصحيحٌ في rk_stock_days_cover القديمة: كانت تقسم على ١٤ دائمًا.
--   فصنفٌ عمره ثلاثة أيام يُقسَم استهلاكه على ١٤ فيظهر خُمس معدّله،
--   وتظهر تغطيته خمسة أضعاف حقيقتها. صار القسمة على المدّة المرصودة
--   فعلًا، لا على طول النافذة.

-- ── ١) إزالة السقّاطة ───────────────────────────────────────
drop trigger  if exists trg_par_follows_restock on stock_items;
drop function if exists rk_par_follows_restock();

-- الأساس يبقى موجودًا ويُضبط عند إنشاء الصنف من أول كميةٍ تُسجَّل له
-- (كل مسارات الإنشاء تكتبه)، ويبقى للمالك أن يعدّله. لكنه لم يعد
-- يتسلّق مع كل تعبئة من وراء ظهره.

-- ── ٢) بصيرة المخزون: استهلاك مقيس، تغطية، وأساسٌ مقترَح ────
drop function if exists rk_stock_days_cover();
drop function if exists rk_stock_insights();

create or replace function rk_stock_insights()
returns table (
  stock_item_id bigint,
  daily_usage   numeric,  -- المقيس فعلًا، لا المفترض
  days_left     numeric,  -- الرصيد ÷ الاستهلاك اليومي
  history_days  numeric,  -- كم يومًا رُصد -- تحتها لا يُوثق بالرقم
  cycle_days    numeric,  -- متوسط ما بين تعبئتين، من واقع الاستلامات
  suggested_par numeric   -- استهلاك دورةٍ كاملة + يومين احتياط
)
language sql
security definer
stable
set search_path = public
as $ins$
  with mv as (
    select sm.stock_item_id, sm.delta, sm.reason, sm.created_at
      from stock_movements sm
     where sm.business_id = current_business_id()
       and sm.created_at > now() - interval '28 days'
  ),
  usage as (
    -- البيع والاستهلاك التلقائي هما الطلب. والهدر خسارةٌ لا طلب، فلا
    -- يُدخل في معدّل الاستهلاك وإلا صار هدرٌ عارض توقّعًا دائمًا.
    select u.stock_item_id,
           sum(-u.delta) as used,
           greatest(extract(epoch from (now() - min(u.created_at))) / 86400.0, 1.0) as span_days
      from mv u
     where u.reason in ('sale', 'indirect') and u.delta < 0
     group by u.stock_item_id
  ),
  receipts as (
    -- دورة التوريد تُقاس من تباعد الاستلامات نفسها، لا تُسأل.
    select r.stock_item_id,
           count(*) as n,
           extract(epoch from (max(r.created_at) - min(r.created_at))) / 86400.0 as span
      from mv r
     where r.reason = 'purchase' and r.delta > 0
     group by r.stock_item_id
  )
  select si.id,
         case when coalesce(u.used, 0) > 0
              then round(u.used / u.span_days, 4) end,
         case when coalesce(u.used, 0) > 0 and u.used / u.span_days > 0
              then round(si.qty_on_hand / (u.used / u.span_days), 1) end,
         round(coalesce(u.span_days, 0), 1),
         case when rc.n >= 2 and rc.span > 0
              then round(rc.span / (rc.n - 1), 1) end,
         case when coalesce(u.used, 0) > 0
              then round(
                (u.used / u.span_days)
                * (coalesce(case when rc.n >= 2 and rc.span > 0 then rc.span / (rc.n - 1) end, 7) + 2),
              2) end
    from stock_items si
    left join usage    u  on u.stock_item_id  = si.id
    left join receipts rc on rc.stock_item_id = si.id
   where si.business_id = current_business_id();
$ins$;

revoke all    on function rk_stock_insights() from public, anon;
grant execute on function rk_stock_insights() to authenticated;
