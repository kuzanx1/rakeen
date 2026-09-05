-- تصميم الفاتورة الجديد يحتاج بيانات لم تكن تُخزَّن.
--
-- شعار الفاتورة عمود مستقل عن logo_url عمداً، لا اختصاراً له. صاحب
-- المطعم قد يريد شعاراً أنظف للطباعة الحرارية بأبيض وأسود -- والأهم أن
-- تركه فارغاً قرارٌ يعني "اطبع الاسم وحده"، وهو معنى لا يمكن التعبير
-- عنه لو كان العمود مشتركاً مع شعار المتجر.
--
-- ويتبع النمط القائم نفسه: loyalty_logo_url و loyalty_tagline موجودان
-- منذ بطاقة الولاء، وهذان توأمهما للفاتورة.
alter table businesses add column if not exists receipt_logo_url text;
alter table businesses add column if not exists receipt_tagline text;

-- الحي والمدينة عمودان مستقلان عن branches.address.
--
-- العنوان الكامل للخرائط والتوصيل، وقد يطول سطرين. أما الفاتورة فتريد
-- "حي البيعة، الطائف" -- سطراً قصيراً يعرف به الزبون أي فرع بيده. جعلهما
-- عمودين لا سطراً واحداً يجعلهما صالحين لغير الفاتورة أيضاً: اختيار
-- الفرع، ونطاقات التوصيل، وتجميع التقارير بالمدينة.
alter table branches add column if not exists district text;
alter table branches add column if not exists city text;

comment on column businesses.receipt_logo_url is
  'شعار الفاتورة المطبوعة وحدها. فارغ = اطبع اسم المنشأة بلا شعار.';
comment on column businesses.receipt_tagline is
  'سطر تحت الاسم في الفاتورة المطبوعة.';
comment on column branches.district is 'الحي، للسطر التعريفي في الفاتورة.';
comment on column branches.city is 'المدينة، للسطر التعريفي في الفاتورة.';

-- الاسم تحت الشعار اختياري: أغلب الشعارات تحمل الاسم داخلها، فكتابته
-- تحتها تكرار. الافتراض true لأن الفواتير القائمة تطبعه اليوم، وتغيير
-- شكل ورقة كل مطعم بترحيل ليس من حقّنا.
alter table businesses add column if not exists receipt_show_name boolean not null default true;
comment on column businesses.receipt_show_name is
  'هل يُطبع اسم المنشأة تحت الشعار في الفاتورة. يُتجاهل حين لا يوجد شعار.';
