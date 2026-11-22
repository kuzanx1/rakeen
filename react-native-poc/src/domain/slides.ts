/**
 * منطقُ تقسيم منيو المطعم صفحاتٍ لشاشة الزبون -- حسابٌ خالص، بلا شبكةٍ
 * ولا تخزين، فيُختبر وحده (انظر __tests__/slidePages.test.ts).
 * المستهلك: application/customerDisplayService.
 */

/**
 * المنيو المتحرك: صفحاتٌ تتبدّل على شاشة الزبون، كلُّ صفحةٍ قسمٌ
 * بأصنافه -- صورةٌ واسمٌ وسعر.
 *
 * الترتيب ترتيبُ الأقسام نفسه في لوحة ركين (sort_order)، لا ترتيباً
 * ثانياً يُدار من مكانٍ آخر: المالك يرتّب أقسامه مرّةً فيُرتَّب كلُّ
 * شيء -- الكاشير، والمتجر، وهذي الشاشة.
 *
 * وقسمٌ فيه صنفٌ أو صنفان لا يستحقّ صفحةً شبه فاضية، فينضمُّ لجاره ما
 * دام المجموع يسع صفحةً مريحة. والقسم الكبير ينقسم أنصافاً متساوية --
 * تسعةُ أصناف تصير خمسةً وأربعة، لا ثمانيةً وواحداً.
 */
/** ثوانٍ لكل صفحة: الزبون واقفٌ يقرأ، لا يتصفّح. */
export const SLIDE_SECONDS = 7;
export const SLIDE_MAX = 8;
const SLIDE_SMALL = 3;
const SLIDE_MERGE_MAX = 6;

export interface SlidePage {
  /** عنوان الصفحة: اسم القسم، أو اسمان مدموجان. */
  t: string;
  i: { n: string; p: string; u?: string }[];
}

export function buildSlidePages(
  categories: { id: string; name: string }[],
  products: { name: string; price: number; categoryId: string; categoryIds?: string[]; imageUrl: string | null; imageThumbUrl: string | null }[],
): SlidePage[] {
  const pages: SlidePage[] = [];
  for (const c of categories) {
    const mine = products.filter(p => (p.categoryIds || [p.categoryId]).includes(c.id));
    if (mine.length === 0) continue;
    const items = mine.map(p => {
      const u = p.imageThumbUrl || p.imageUrl || '';
      return { n: p.name, p: p.price.toFixed(2), ...(/^https:\/\//i.test(u) ? { u } : {}) };
    });
    const last = pages[pages.length - 1];
    if (
      last &&
      items.length <= SLIDE_SMALL &&
      last.i.length <= SLIDE_SMALL &&
      last.i.length + items.length <= SLIDE_MERGE_MAX
    ) {
      last.t += ' · ' + c.name;
      last.i.push(...items);
      continue;
    }
    if (items.length <= SLIDE_MAX) {
      pages.push({ t: c.name, i: items });
      continue;
    }
    // أنصافٌ متساوية: عددُ الصفحات أولاً، ثم يُقسَّم عليها.
    const count = Math.ceil(items.length / SLIDE_MAX);
    const per = Math.ceil(items.length / count);
    for (let k = 0; k < items.length; k += per) pages.push({ t: c.name, i: items.slice(k, k + per) });
  }
  return pages;
}
