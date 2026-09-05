-- ما يظهر في تقرير إغلاق الوردية وما لا يظهر.
--
-- عمود jsonb واحد لا خمسة أعمدة منطقية: هذي خيارات عرضٍ لورقة واحدة،
-- يُقرأ كلها معاً ويُكتب كلها معاً، ولا يُستعلم عن واحد منها وحده ولا
-- يُفهرَس. وإضافة خيار سادس لاحقاً لا تحتاج ترحيلاً.
--
-- والغياب يعني "أظهر": التقرير القديم كان يعرض ما فيه، والترحيل لا يجوز
-- أن يُخفي عن محاسبٍ سطراً كان يراه أمس.
alter table businesses
  add column if not exists shift_report_options jsonb not null default '{}'::jsonb;

comment on column businesses.shift_report_options is
  'خيارات عرض تقرير إغلاق الوردية: discounts, refunds, vat, counts, signatures. false = أخفِ السطر، والغياب = أظهره.';
