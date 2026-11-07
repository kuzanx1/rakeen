-- سعر العرض وسعره قبل الخصم على بطاقة العرض في المتجر.
--
-- العرض المربوط بصنف ياخذ سعره من الصنف نفسه دائماً (اللي يندفع فعلاً)،
-- فـ price يُستخدم بس للعرض غير المربوط (بوكس عند الكاشير مثلاً).
-- compare_price اختياري: لو أكبر من السعر، يطلع مشطوب مع نسبة الخصم.
-- المتجر واللوحة يرجعون للاستعلام القديم لو العمودين ما رُحّلوا.
alter table store_offers add column if not exists price numeric(10,2);
alter table store_offers add column if not exists compare_price numeric(10,2);
alter table store_offers drop constraint if exists store_offers_price_nonneg;
alter table store_offers add constraint store_offers_price_nonneg
  check ((price is null or price >= 0) and (compare_price is null or compare_price >= 0));
