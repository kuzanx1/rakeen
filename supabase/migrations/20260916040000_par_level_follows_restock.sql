-- «مخزونك المعتاد» يتبع التعبئة صعودًا — وإلا بقي الشريط ١٠٠٪ لا يتحرك.
--
-- ▓ العطل:
--   النسبة = الموجود ÷ par_level، وتُقصّ عند ١٠٠٪.
--   فصاحب المطعم يعبّئ من ٣٣٩ إلى ١٠٠٠ ويبقى par_level ٣٣٩:
--     1000 ÷ 339 = 295%  → تُقصّ إلى 100%
--      980 ÷ 339 = 289%  → تُقصّ إلى 100%
--   فالرقم ينزل مع كل بيع والشريط جامد، حتى ينزل الرصيد تحت ٣٣٩ بعد
--   أسابيع. وهو يقرأ ذلك على أن المخزون لا ينقص أصلًا.
--
--   ولا يكفي إصلاحه في نافذة تعديل الصنف: فواتير الشراء ترفع
--   qty_on_hand عبر تريغرها الخاص بلا مرور بالواجهة، وكذلك الاستيراد
--   والمساعد الموجَّه. فالقاعدة تُفرض في مكان واحد يمرّ به الجميع.
--
-- ▓ القاعدة: الأساس يصعد مع الموجود ولا ينزل معه أبدًا.
--   من عبّأ إلى ألف فالألف مِلؤه الجديد، وما نقص بعدها فهو بيعٌ يُقاس
--   عليه. ولو تبع الأساسُ النزولَ أيضًا لبقيت النسبة ١٠٠٪ إلى الأبد --
--   وهي العلّة نفسها مقلوبة.
--
--   ويبقى للمالك أن يكتب أساسًا أقلّ بيده متى شاء؛ هذا التريغر لا
--   يعترض ما يكتبه، إنما يرفع الأساس حين يتجاوزه الموجود.

create or replace function rk_par_follows_restock()
returns trigger
language plpgsql
set search_path = public
as $par$
begin
  if new.qty_on_hand is not null
     and new.qty_on_hand > coalesce(new.par_level, 0) then
    new.par_level := new.qty_on_hand;
  end if;
  return new;
end;
$par$;

set lock_timeout = '5s';
drop trigger if exists trg_par_follows_restock on stock_items;
create trigger trg_par_follows_restock
  before insert or update of qty_on_hand, par_level on stock_items
  for each row execute function rk_par_follows_restock();
reset lock_timeout;

-- تصحيح الحالة القائمة: كل صنف رصيده الآن أعلى من أساسه كان شريطه
-- مقصوصًا على ١٠٠٪ ولا يتحرك. يُرفع أساسه مرّةً واحدة ليبدأ القياس.
update stock_items
   set par_level = qty_on_hand
 where qty_on_hand > coalesce(par_level, 0);
