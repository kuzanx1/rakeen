import { buildSlidePages } from '../src/domain/slides';

/**
 * المنيو المتحرك على شاشة الزبون: كيف يُقسَّم منيو مطعمٍ حقيقيّ صفحات.
 *
 * الأرقام هنا ليست مخترعة: هي أقسام «كباب طارق» (النشاط ١١٦) بعددِ
 * أصنافِ كلِّ قسمٍ كما هي في قاعدة البيانات يوم كُتب هذا -- لأن القاعدة
 * التي تبدو معقولةً على ورقةٍ قد تُخرج صفحةً فيها كرتٌ واحدٌ على شاشةٍ
 * أمام زبون.
 */

type Cat = { id: string; name: string };
type Prod = {
  name: string;
  price: number;
  categoryId: string;
  categoryIds?: string[];
  imageUrl: string | null;
  imageThumbUrl: string | null;
};

/** قسمٌ باسمه وعددِ أصنافه -> أصنافٌ وهمية بنفس العدد. */
function menu(spec: [string, number][]): { cats: Cat[]; products: Prod[] } {
  const cats: Cat[] = spec.map(([name], i) => ({ id: String(i + 1), name }));
  const products: Prod[] = [];
  spec.forEach(([name, n], i) => {
    for (let k = 0; k < n; k++) {
      products.push({
        name: `${name} ${k + 1}`,
        price: 20 + k,
        categoryId: String(i + 1),
        imageUrl: `https://img.example/${i}-${k}.jpg`,
        imageThumbUrl: null,
      });
    }
  });
  return { cats, products };
}

const TAREK: [string, number][] = [
  ['الجمعات', 1],
  ['بوكسات عائلة طارق', 3],
  ['بوكسات طارق', 7],
  ['وجبات طارق', 9],
  ['ساندوتشات طارق', 4],
  ['أطباق طارق', 4],
  ['المقبلات', 5],
  ['الطلبات الجانبية', 3],
  ['الصوصات', 3],
  ['المشروبات', 14],
];

describe('buildSlidePages -- منيو كباب طارق', () => {
  const { cats, products } = menu(TAREK);
  const pages = buildSlidePages(cats, products);

  it('ما يترك صفحةً فيها صنفٌ أو صنفان', () => {
    for (const p of pages) expect(p.i.length).toBeGreaterThanOrEqual(3);
  });

  it('ما يحشر في صفحةٍ أكثر من ثمانية', () => {
    for (const p of pages) expect(p.i.length).toBeLessThanOrEqual(8);
  });

  it('يضمّ القسم الصغير لجاره باسميهما', () => {
    expect(pages[0].t).toBe('الجمعات · بوكسات عائلة طارق');
    expect(pages[0].i).toHaveLength(4);
    const sides = pages.find(p => p.t.startsWith('الطلبات الجانبية'));
    expect(sides?.t).toBe('الطلبات الجانبية · الصوصات');
    expect(sides?.i).toHaveLength(6);
  });

  it('القسم الكبير ينقسم أنصافاً متساوية، لا ثمانيةً وواحداً', () => {
    const meals = pages.filter(p => p.t === 'وجبات طارق').map(p => p.i.length);
    expect(meals).toEqual([5, 4]);
    const drinks = pages.filter(p => p.t === 'المشروبات').map(p => p.i.length);
    expect(drinks).toEqual([7, 7]);
  });

  it('القسم اللي يسع صفحةً يبقى وحده بترتيبه', () => {
    expect(pages.map(p => p.t)).toEqual([
      'الجمعات · بوكسات عائلة طارق',
      'بوكسات طارق',
      'وجبات طارق',
      'وجبات طارق',
      'ساندوتشات طارق',
      'أطباق طارق',
      'المقبلات',
      'الطلبات الجانبية · الصوصات',
      'المشروبات',
      'المشروبات',
    ]);
  });

  it('كل الأصناف تطلع، ولا صنف ينضاع', () => {
    const shown = pages.reduce((n, p) => n + p.i.length, 0);
    expect(shown).toBe(products.length);
  });

  it('السعر نصٌّ بخانتين، والصورة تنحذف إذا ما هي https', () => {
    const noPhoto = buildSlidePages(
      [{ id: '1', name: 'مشروبات' }],
      [
        { name: 'ماء', price: 2, categoryId: '1', imageUrl: null, imageThumbUrl: null },
        { name: 'شاي', price: 5.5, categoryId: '1', imageUrl: 'data:image/png;base64,x', imageThumbUrl: null },
        { name: 'قهوة', price: 10, categoryId: '1', imageUrl: 'https://i/x.jpg', imageThumbUrl: null },
      ],
    );
    expect(noPhoto[0].i.map(i => i.p)).toEqual(['2.00', '5.50', '10.00']);
    expect(noPhoto[0].i.map(i => i.u)).toEqual([undefined, undefined, 'https://i/x.jpg']);
  });

  it('الصورة المصغّرة تسبق الأصلية', () => {
    const p = buildSlidePages(
      [{ id: '1', name: 'ق' }],
      [{ name: 'س', price: 1, categoryId: '1', imageUrl: 'https://i/big.jpg', imageThumbUrl: 'https://i/small.jpg' }],
    );
    expect(p[0].i[0].u).toBe('https://i/small.jpg');
  });

  it('قسمٌ بلا أصناف ما يطلع صفحةً فاضية', () => {
    const p = buildSlidePages(
      [{ id: '1', name: 'فاضي' }, { id: '2', name: 'فيه' }],
      [{ name: 'س', price: 1, categoryId: '2', imageUrl: null, imageThumbUrl: null }],
    );
    expect(p.map(x => x.t)).toEqual(['فيه']);
  });

  it('المنتج في قسمين يطلع في صفحتيهما', () => {
    const p = buildSlidePages(
      [{ id: '1', name: 'أول' }, { id: '2', name: 'ثاني' }],
      [
        { name: 'مشترك', price: 1, categoryId: '1', categoryIds: ['1', '2'], imageUrl: null, imageThumbUrl: null },
        { name: 'أ', price: 1, categoryId: '1', imageUrl: null, imageThumbUrl: null },
        { name: 'ب', price: 1, categoryId: '2', imageUrl: null, imageThumbUrl: null },
      ],
    );
    // قسمان صغيران فينضمّان، والمشترك مرّتان -- مرّةً لكل قسم.
    expect(p).toHaveLength(1);
    expect(p[0].i.map(i => i.n)).toEqual(['مشترك', 'أ', 'مشترك', 'ب']);
  });

  it('منيو فاضي ما يرجّع صفحات (فتبقى الشاشة على الهوية)', () => {
    expect(buildSlidePages([], [])).toEqual([]);
  });
});
