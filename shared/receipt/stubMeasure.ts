/**
 * قياسٌ صوريٌّ ثابت -- لأجل الاختبار وحده.
 *
 * القياسُ الحقيقيّ عند المنفّذ: الكانفسُ يعرف خطَّه وSkia تعرف خطَّها،
 * وكلاهما يحتاج متصفّحاً أو جهازاً. فلا يُختبر التخطيطُ بهما.
 *
 * وهذا يُعيد عرضاً يعتمد على الحرف وحده: فيُشغَّل في node بلا شيء،
 * ويعطي النتيجةَ نفسَها في كلّ مرّة -- وهو ما يحتاجه اختبارُ المقارنة.
 * والعربيةُ أعرضُ من اللاتينية بمقدارٍ محسوس، والفراغُ أضيق، فالنسبُ
 * قريبةٌ من الواقع بما يكفي لأن يقع اللفُّ حيث يقع حقّاً.
 */

import type { Family } from './types';

const NARROW = /[ ,.:|]/;
const WIDE = /[؀-ۿ]/;

export function stubMeasure(
  text: string,
  size: number,
  weight: number,
  family: Family,
): number {
  // الأحاديُّ العرض ثابتُ الخانة -- وهذا سببُ استعماله للمبالغ أصلاً.
  if (family === 'mono') return text.length * size * 0.6;
  let w = 0;
  for (const ch of text) {
    if (NARROW.test(ch)) w += size * 0.28;
    else if (WIDE.test(ch)) w += size * 0.52;
    else w += size * 0.46;
  }
  // الثقيلُ أعرضُ قليلاً من العاديّ.
  return weight >= 800 ? w * 1.04 : w;
}
