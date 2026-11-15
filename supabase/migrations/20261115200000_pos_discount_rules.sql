-- قواعد خصم الكاشير — خيارات يفعّلها المالك من «الخصومات والكوبونات ← قواعد الكاشير».
--
-- تنطبق على الخصم اللي يكتبه الكاشير من عنده بس (نسبة أو مبلغ يختاره هو).
-- الخصومات الجاهزة والكوبونات حطّها المالك بنفسه، فما تنطبق عليها.
--
-- pos_discount_reason_required
--   true: الكاشير ما يطبّق خصمه إلا لو كتب السبب. الافتراضي false (زي اليوم).
--
-- pos_discount_max_pct / pos_discount_max_amount
--   الحد الأعلى بدون موافقة. null = بدون حد (زي اليوم).
--   خصم بالنسبة يُقارن بـ max_pct، وخصم بالمبلغ يُقارن بـ max_amount.
--   فوق الحد: يطلب رمز المدير (verify_pos_manager_pin الموجود من قبل)،
--   وينكتب بالسبب «(بموافقة المدير)».
--
-- ALTER على جدول businesses (جدول حار): lock_timeout عشان ما يعلّق
-- لو فيه قفل طويل — لو طلع خطأ timeout، شغّله مرة ثانية.

begin;
set local lock_timeout = '5s';

alter table businesses
  add column if not exists pos_discount_reason_required boolean not null default false,
  add column if not exists pos_discount_max_pct numeric(5,2),
  add column if not exists pos_discount_max_amount numeric(10,2);

alter table businesses drop constraint if exists businesses_pos_discount_max_pct_chk;
alter table businesses add constraint businesses_pos_discount_max_pct_chk
  check (pos_discount_max_pct is null or (pos_discount_max_pct > 0 and pos_discount_max_pct <= 100));
alter table businesses drop constraint if exists businesses_pos_discount_max_amount_chk;
alter table businesses add constraint businesses_pos_discount_max_amount_chk
  check (pos_discount_max_amount is null or pos_discount_max_amount > 0);

comment on column businesses.pos_discount_reason_required is
  'POS: the cashier must type a reason for a discount they enter themselves (not presets/coupons). Off by default.';
comment on column businesses.pos_discount_max_pct is
  'POS: highest percent discount the cashier may enter without the manager PIN. NULL = no limit.';
comment on column businesses.pos_discount_max_amount is
  'POS: highest fixed-amount discount (SAR) the cashier may enter without the manager PIN. NULL = no limit.';

commit;
