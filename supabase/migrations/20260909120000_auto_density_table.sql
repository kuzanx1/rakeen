-- تحويل لتر↔غرام تلقائيًا بلا سؤال — جدول كثافات مدمج
--
-- المشكلة: نظام الوحدات (20260909090000) كان يسأل صاحب المطعم «كم غرام يزن
-- لتر هذا الصنف؟» ويخزّنه في stock_items.grams_per_unit. سؤال كيميائي ما
-- المفروض يتشال على صاحب مقهى — الكثافة معلومة فيزيائيًا لكل سائل.
--
-- الفيزياء: التحويل بين الحجم (لتر/مل) والكتلة (كغ/غ) يحتاج الكثافة ρ = m/V،
-- وهي خاصية للمادة نفسها لا رقم عام. القيم أدناه كثافات نموذجية عند ~20°م
-- بوحدة غرام/لتر (= كغ/م³):
--   ماء 1000 · حليب 1030 · لبن/زبادي سائل 1035 · قشطة/كريمة 1010 ·
--   حليب مكثّف محلّى 1290 · حليب مبخّر 1070 · زيت/سمن 915 · عسل 1420 ·
--   دبس 1350 · شراب سكر 1300 · جلوكوز/نشا سائل 1400 · شراب قيقب 1370 ·
--   صوص شوكولاتة/كراميل 1270 · صويا 1200 · كاتشب 1140 · طحينة 1100 ·
--   رب طماطم 1100 · صلصة طماطم 1050 · مايونيز 1050 · خردل 1050 ·
--   عصير/مشروب غازي 1045 · خل 1010 · مرق 1010 · شاي/قهوة 1000
-- المجهول → كثافة الماء (1000)، خطؤه لأغلب سوائل المطبخ أقل من ٥٪.
--
-- الحل: دالة rka_density_for(name) + تريغر يملأ grams_per_unit تلقائيًا لكل
-- صنف مُتتبَّع بلتر/مل (وحدة التتبّع تحدّد: غرام/لتر أو غرام/مل). صار عمودًا
-- مُشتقًّا بالكامل من (الاسم، الوحدة) — يتحدّث لو غيّرت الاسم. لا يمسّ
-- rka_to_base ولا دوال التكلفة الأربع — كلها تقرأ grams_per_unit كما هي.
--
-- كتل بالترتيب. stock_items ليس جدولًا مزدحمًا، وset lock_timeout حول التريغر.


-- ▓▓▓ كتلة ١ من ٤ — دالة الكثافة (غرام/لتر) ────────────────────────────────
create or replace function rka_density_for(p_name text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_name is null then null
    when p_name ~ 'زيت|زيوت|سمن|سمنة|أوليف|ghee|oil'                     then 915
    when p_name ~ 'عسل|honey'                                            then 1420
    when p_name ~ 'جلوكوز|نشا سائل|شراب ذرة|glucose'                     then 1400
    when p_name ~ 'قيقب|maple'                                          then 1370
    when p_name ~ 'دبس|molasses'                                        then 1350
    when p_name ~ 'مكثف|مكثّف|محلى|محلّى|condensed'                     then 1290
    when p_name ~ 'شراب|سيرب|سكر سائل|syrup'                        then 1300
    when p_name ~ 'كراميل|كاراميل|شوكولا|فدج|caramel|chocolate|fudge'   then 1270
    when p_name ~ 'صويا|soy'                                            then 1200
    when p_name ~ 'كاتش|كتش|ketchup|catsup'                             then 1140
    when p_name ~ 'طحين|طحينة|طحينية|tahin'                             then 1100
    when p_name ~ 'رب طماطم|معجون طماطم|tomato paste'                    then 1100
    when p_name ~ 'مبخر|مبخّر|evaporated'                              then 1070
    when p_name ~ 'صلصة|بيوريه|بسارة|بسّارة|passata|puree|marinara'      then 1050
    when p_name ~ 'مايون|mayo'                                          then 1050
    when p_name ~ 'خردل|mustard'                                        then 1050
    when p_name ~ 'صوص|صلصات|sauce'                                     then 1050
    when p_name ~ 'عصير|juice|كولا|بيبسي|مشروب غاز|صودا|soda|cola|pepsi|sprite' then 1045
    when p_name ~ 'رايب|رائب|زبادي|زباده|روب|لبن مخيض|بترميلك|buttermilk|yogurt|yoghurt|laban' then 1035
    when p_name ~ 'حليب|لبن|milk'                                       then 1030
    when p_name ~ 'قشطة|قشطه|كريمة|كريمه|كريم |cream'                    then 1010
    when p_name ~ 'خل |خلّ|vinegar'                                     then 1010
    when p_name ~ 'مرق|شوربا|شوربة|broth|stock'                         then 1010
    when p_name ~ 'ماء|مياه|ماي|مويه|شاي|قهوة|قهوه|أمريكانو|امريكانو|إسبريسو|اسبريسو|نعناع|كركديه|ماء ورد|ماء زهر|water|tea|coffee|americano|espresso' then 1000
    else null
  end
$$;
revoke all on function rka_density_for(text) from public, anon;
grant execute on function rka_density_for(text) to authenticated;


-- ▓▓▓ كتلة ٢ من ٤ — تريغر يملأ grams_per_unit من (الاسم، الوحدة) ──────────
create or replace function stock_items_fill_density()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- grams_per_unit = وزن وحدة تتبّع واحدة بالغرام: غ/لتر للتر، غ/مل للمل.
  -- مُشتقّ بالكامل — لا إدخال يدوي بعد الآن. المجهول → كثافة الماء.
  new.grams_per_unit := case
    when new.unit = 'liter' then coalesce(rka_density_for(new.name), 1000)
    when new.unit = 'ml'    then coalesce(rka_density_for(new.name), 1000) / 1000.0
    else null
  end;
  return new;
end
$$;

set lock_timeout = '5s';
drop trigger if exists trg_stock_items_fill_density on stock_items;
create trigger trg_stock_items_fill_density
  before insert or update of name, unit, grams_per_unit on stock_items
  for each row execute function stock_items_fill_density();
reset lock_timeout;


-- ▓▓▓ كتلة ٣ من ٤ — ملء الأصناف القائمة ───────────────────────────────────
update stock_items set grams_per_unit = case
    when unit = 'liter' then coalesce(rka_density_for(name), 1000)
    when unit = 'ml'    then coalesce(rka_density_for(name), 1000) / 1000.0
    else null
  end
where unit in ('liter','ml') or grams_per_unit is not null;


-- ▓▓▓ كتلة ٤ من ٤ — تحقّق سريع (اختياري) ─────────────────────────────────
--   select name, unit, grams_per_unit from stock_items
--   where unit in ('liter','ml') order by name;
--   المتوقّع: كل صنف لتر/مل عنده رقم (كثافته المعروفة أو 1000 للمجهول).
