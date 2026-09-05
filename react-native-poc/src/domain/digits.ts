/**
 * الأرقام العربية تُقبل، لا تُرفض.
 *
 * لوحة مفاتيح آيباد بواجهة عربية تكتب ٠١٢٣ لا 0123 -- محارف أخرى
 * تماماً في يونيكود. وكل حقل رقمي في هذا التطبيق كان يمرّرها إلى
 * Number()، وNumber('٥') = NaN، فيرى الكاشير "اكتب مبلغ صحيح" وهو
 * ينظر إلى مبلغ كتبه صحيحاً بلوحة جهازه.
 *
 * وهذا ليس خطأ يُعرض، بل حرفٌ يُترجم: الرقم واحد والرسم مختلف.
 *
 * تشمل الصورتين معاً -- العربية (٠-٩) والفارسية (۰-۹) -- لأن لوحات
 * المفاتيح تختلف فيهما، والكاشير لا يعرف أيّهما أعطاه جهازه. وتشمل
 * الفاصلة العشرية العربية (٫) والفاصلة اللاتينية (,) فكلتاهما تُكتب
 * مكان النقطة.
 */

/** ٠ = U+0660، و ۰ الفارسية = U+06F0. */
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

export function toLatinDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
      out += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    } else if (ch === '٫' || ch === '،' || ch === ',') {
      // الفاصلة العشرية العربية، وفاصلة الآلاف العربية، واللاتينية.
      // كلها تُكتب مكان النقطة على لوحة أو أخرى.
      out += '.';
    } else {
      out += ch;
    }
  }
  return out;
}
