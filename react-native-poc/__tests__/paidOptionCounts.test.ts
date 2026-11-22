import {
  addToCartWithConfig,
  applyOptionCounts,
  cartTotals,
  computeLineStockDecrements,
  lineOptionsExtra,
  lineUnitPrice,
  maxOptionCount,
  optionCount,
  optionTakesCount,
  withOptionCount,
} from '../src/domain/cart';
import type { CartLine, ModifierDefinition } from '../src/domain/cart';

/**
 * قاعدةُ المالك، حرفاً: «كل زايدة وحدة زيادة حسب قيمة الخيار».
 *
 * خمس شرائح جبن بريالين = عشرة، سواء وُضعت على خمسة ساندوتشات أو
 * كُدّست على واحد. فمجموع السطر = سعر المنتج × الكمية + سعر الإضافة
 * × عددها، لا غير.
 */
const SANDWICH = 10;

const modDef: ModifierDefinition = {
  alwaysCustomize: false,
  groups: [
    {
      id: 'g1',
      name: 'الإضافات',
      type: 'multi',
      required: false,
      max: null,
      options: [
        { id: 'cheese', name: 'جبنة', price: 2 },
        { id: 'noFries', name: 'بدون بطاطس', price: 0 },
      ],
    },
  ],
};
// مجموعة «متعددة» كما يحمّلها catalogService: النوع عنده 'multiple'.
(modDef.groups[0] as unknown as { type: string }).type = 'multiple';

const cheese = modDef.groups[0].options[0];
const noFries = modDef.groups[0].options[1];

const line = (qty: number, config: Record<string, string | string[]>): CartLine =>
  ({ lineId: 1, productId: 1, qty, note: '', config } as CartLine);

const unitOf = (l: CartLine) => lineUnitPrice(l, SANDWICH, modDef, 'dine_in', null);
const extraOf = (l: CartLine) => lineOptionsExtra(l.config, modDef, l.qty);
const lineTotal = (l: CartLine) => unitOf(l) * l.qty + extraOf(l);

const withCheese = (qty: number, count: number) =>
  line(qty, applyOptionCounts({ g1: ['cheese'] }, { cheese: count }, qty, modDef));

describe('عدّاد الخيار المدفوع', () => {
  it('٥ ساندوتش و٥ جبن = ٦٠ (الجبن ١٠)', () => {
    const l = withCheese(5, 5);
    expect(optionCount(l.config, 'cheese')).toBeNull(); // العدد = الكمية، فلا يُكتب
    expect(extraOf(l)).toBe(0);
    expect(lineTotal(l)).toBe(60);
  });

  it('ساندوتش واحد و٥ جبن = ٢٠ (الجبن ١٠ برضو)', () => {
    const l = withCheese(1, 5);
    expect(optionCount(l.config, 'cheese')).toBe(5);
    expect(unitOf(l)).toBe(12);
    expect(extraOf(l)).toBe(8);
    expect(lineTotal(l)).toBe(20);
  });

  it('٥ ساندوتش والجبن على اثنين = ٥٤', () => {
    const l = withCheese(5, 2);
    expect(extraOf(l)).toBe(-6);
    expect(lineTotal(l)).toBe(54);
  });

  it('العدد مطلق: تغيير الكمية بعد الإضافة ما يحرّك ثمن الجبن', () => {
    const l = withCheese(1, 5);
    const bumped = { ...l, qty: 3 };
    expect(lineTotal(bumped)).toBe(SANDWICH * 3 + 2 * 5);
  });

  it('المجموع يحمل الفرق، وبدون عدّاد يبقى الحساب كما كان', () => {
    const counted = withCheese(1, 5);
    const plain = line(1, { g1: ['cheese'] });
    expect(cartTotals([counted], unitOf, 0, false, 0.15, true, 0, extraOf).subtotal).toBe(20);
    expect(cartTotals([plain], unitOf, 0, false, 0.15, true, 0, extraOf).subtotal).toBe(12);
    expect(cartTotals([plain], unitOf, 0, false, 0.15, true).subtotal).toBe(12);
  });

  it('المخزون ينقص بعدد الشرائح لا بالكمية', () => {
    const stock = { g1_cheese: { stockItemId: 7, qty: 20, unit: 'g' } };
    const units = { 7: 'g' };
    expect(computeLineStockDecrements(withCheese(1, 5), modDef, stock, units)).toEqual([
      { stock_item_id: 7, qty: 100 },
    ]);
    expect(computeLineStockDecrements(line(5, { g1: ['cheese'] }), modDef, stock, units)).toEqual([
      { stock_item_id: 7, qty: 100 },
    ]);
  });

  it('يُطبع «جبنة ×5»', () => {
    expect(withOptionCount('جبنة', withCheese(1, 5).config, 'cheese')).toBe('جبنة ×5');
    expect(withOptionCount('جبنة', withCheese(5, 5).config, 'cheese')).toBe('جبنة');
  });
});

describe('المجاني والمدفوع سواء -- الفرق السعر وحده', () => {
  const group = modDef.groups[0];

  it('الاثنان لهما عدّاد، ولو كانت الكمية واحداً', () => {
    expect(optionTakesCount(group)).toBe(true);
    expect(maxOptionCount()).toBe(99);
  });

  it('كتشب مجاني ×3 على ساندوتشٍ واحد: يُعَدّ ويُطبع، وبلا ريال', () => {
    const l = line(1, applyOptionCounts({ g1: ['noFries'] }, { noFries: 3 }, 1, modDef));
    expect(optionCount(l.config, 'noFries')).toBe(3);
    expect(withOptionCount('كتشب', l.config, 'noFries')).toBe('كتشب ×3');
    expect(extraOf(l)).toBe(0);
    expect(lineTotal(l)).toBe(SANDWICH);
  });

  it('والمخزون ينقص ثلاثة لا واحداً', () => {
    const stock = { g1_noFries: { stockItemId: 9, qty: 1, unit: 'piece' } };
    const l = line(1, applyOptionCounts({ g1: ['noFries'] }, { noFries: 3 }, 1, modDef));
    expect(computeLineStockDecrements(l, modDef, stock, { 9: 'piece' })).toEqual([
      { stock_item_id: 9, qty: 3 },
    ]);
  });

  it('المجانية بلا سعر: عدّها لا يغيّر الحساب', () => {
    const l = line(5, applyOptionCounts({ g1: ['noFries'] }, { noFries: 2 }, 5, modDef));
    expect(optionCount(l.config, 'noFries')).toBe(2);
    expect(extraOf(l)).toBe(0);
    expect(lineTotal(l)).toBe(50);
  });

  it('العدد يبقى كما هو لو نزلت الكمية بعده -- ٤ أكياس أربعة', () => {
    const free = applyOptionCounts({ g1: ['noFries'] }, { noFries: 4 }, 2, modDef);
    expect(optionCount(free, 'noFries')).toBe(4);
    const paid = applyOptionCounts({ g1: ['cheese'] }, { cheese: 4 }, 2, modDef);
    expect(optionCount(paid, 'cheese')).toBe(4);
  });

  it('مجموعة الحجم (single) ما لها عدّاد', () => {
    expect(optionTakesCount({ type: 'single' })).toBe(false);
  });
});

/* «بطاطس» بمجموعة حجم (single): صغير أو كبير، ولا عدّاد فيها.
   فكيف يُطلب كبيران؟ وكيف كبيرٌ وصغير معاً؟ */
const friesDef: ModifierDefinition = {
  alwaysCustomize: true,
  groups: [
    {
      id: 'size',
      name: 'الحجم',
      type: 'single',
      required: true,
      minSelect: 1,
      max: 1,
      options: [
        { id: 'sm', name: 'صغير', price: 0 },
        { id: 'lg', name: 'كبير', price: 5 },
      ],
    },
  ],
};
const FRIES = 8;

describe('بطاطس بحجمين', () => {
  const add = (cart: CartLine[], size: string, qty: number) =>
    addToCartWithConfig(cart, 2, { size }, qty, () => cart.length + 1);
  const unit = (l: CartLine) => lineUnitPrice(l, FRIES, friesDef, 'dine_in', null);

  it('٢ كبير: سطرٌ واحد كميته ٢ بـ٢٦', () => {
    const cart = add([], 'lg', 2);
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(2);
    expect(unit(cart[0]) * cart[0].qty).toBe((FRIES + 5) * 2);
  });

  it('٢ صغير: سطرٌ واحد كميته ٢ بـ١٦', () => {
    const cart = add([], 'sm', 2);
    expect(cart).toHaveLength(1);
    expect(unit(cart[0]) * cart[0].qty).toBe(FRIES * 2);
  });

  it('واحد كبير وواحد صغير: سطران، ما يندمجان', () => {
    const cart = add(add([], 'lg', 1), 'sm', 1);
    expect(cart).toHaveLength(2);
    expect(unit(cart[0])).toBe(FRIES + 5);
    expect(unit(cart[1])).toBe(FRIES);
  });

  it('وإعادة إضافة نفس الحجم تندمج في سطره', () => {
    const cart = add(add([], 'lg', 1), 'lg', 1);
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(2);
  });

  it('الحجم ما له عدّاد -- الكمية هي اللي تتغيّر', () => {
    expect(optionTakesCount(friesDef.groups[0])).toBe(false);
  });
});
