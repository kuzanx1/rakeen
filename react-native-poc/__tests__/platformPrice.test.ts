import { lineUnitPrice } from '../src/domain/cart';

/**
 * سعر المنتج على تطبيق التوصيل -- نفس productBasePrice في كاشير الويب.
 * كان التطبيق يحسب طلب جاهز/هنقرستيشن بسعر الكاشير لأن الأسعار ما تنقرى.
 */
const prices = { '7': { 101: 29 } }; // منصة 7: البرجر (101) بـ29 بدل 25

const line = (productId: number) => ({ lineId: 1, productId, qty: 1 }) as any;

describe('سعر تطبيق التوصيل', () => {
  test('طلب توصيل على منصة لها سعر: سعر المنصة', () => {
    expect(lineUnitPrice(line(101), 25, undefined, 'delivery', '7', prices)).toBe(29);
  });
  test('منتج بدون سعر خاص بالمنصة: سعر الكاشير', () => {
    expect(lineUnitPrice(line(102), 18, undefined, 'delivery', '7', prices)).toBe(18);
  });
  test('سفري أو محلي: سعر الكاشير حتى لو المنصة مختارة', () => {
    expect(lineUnitPrice(line(101), 25, undefined, 'pickup', '7', prices)).toBe(25);
    expect(lineUnitPrice(line(101), 25, undefined, 'dine_in', '7', prices)).toBe(25);
  });
  test('الإضافات تنضاف فوق سعر المنصة', () => {
    const modDef = { groups: [{ id: 'g', options: [{ id: 'cheese', price: 3 }] }] } as any;
    const withCheese = { lineId: 1, productId: 101, qty: 1, config: { g: 'cheese' } } as any;
    expect(lineUnitPrice(withCheese, 25, modDef, 'delivery', '7', prices)).toBe(32);
  });
});
