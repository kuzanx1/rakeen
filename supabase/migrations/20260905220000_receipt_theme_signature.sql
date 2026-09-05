-- الثيم الرابع لم يكن مسموحاً به في القاعدة.
--
-- أُضيف ثيم "فخم" (signature) إلى الداشبورد وإلى نقطة البيع وإلى
-- التطبيق، وبقي قيد القاعدة على ثلاثة كما كُتب أول مرة. فكان اختياره
-- من لوحة التحكم يسقط عند الحفظ برسالة:
--
--   new row for relation "businesses" violates check constraint
--   "businesses_receipt_theme_check"
--
-- وأثره لم يقف عند رسالة خطأ: الحفظ يفشل، فيبقى في العمود ما كان
-- قبله، فتطبع الفاتورة بثيم لم يعد أحد يختاره -- وهو ما بدا "الفاتورة
-- لا تطابق ما اخترته في لوحة التحكم".
--
-- ولا مصدر واحد لهذه القائمة: هي مكرّرة في أربعة مواضع مستقلة (القيد
-- هنا، RECEIPT_THEMES في rakeen-dashboard.js، ومثلها في rakeen-pos.js،
-- وTHEMES في react-native-poc/src/domain/receiptTheme.ts). فمن زاد
-- ثيماً زاده في أربعة، أو كسر الحفظ.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'businesses_receipt_theme_check'
  ) then
    alter table businesses drop constraint businesses_receipt_theme_check;
  end if;

  alter table businesses
    add constraint businesses_receipt_theme_check
    check (receipt_theme in ('classic', 'compact', 'elegant', 'signature'));
end $$;

comment on column businesses.receipt_theme is
  'classic | compact | elegant | signature. القائمة نفسها مكرّرة في rakeen-dashboard.js و rakeen-pos.js و react-native-poc/src/domain/receiptTheme.ts -- أي ثيم جديد يُضاف في الأربعة معاً.';
