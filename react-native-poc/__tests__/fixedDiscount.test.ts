import { cartTotals } from '../src/domain/cart';
import { discountLabel } from '../src/domain/discount';

// سطر واحد بـ ٥٠ ريال × ٢ = ١٠٠
const lines = [{ qty: 2 }] as never[];
const price = () => 50;

describe('الخصم بالمبلغ', () => {
  it('١٠ ريال من فاتورة ١٠٠ (الأسعار شاملة الضريبة)', () => {
    const t = cartTotals(lines, price, 0, true, 0.15, true, 10);
    expect(t.discount).toBe(10);
    expect(t.total).toBe(90);
  });
  it('يغلب النسبة لو الاثنين انرسلوا', () => {
    expect(cartTotals(lines, price, 50, true, 0.15, true, 10).discount).toBe(10);
  });
  it('ما يتعدّى المجموع', () => {
    const t = cartTotals(lines, price, 0, true, 0.15, true, 250);
    expect(t.discount).toBe(100);
    expect(t.total).toBe(0);
  });
  it('النسبة على حالها لما المبلغ صفر', () => {
    expect(cartTotals(lines, price, 10, true, 0.15, true).discount).toBe(10);
  });
  it('النص: ١٠٪ أو ١٠ ﷼', () => {
    expect(discountLabel(10, 0)).toBe('10٪');
    expect(discountLabel(0, 12.5)).toBe('12.5 ﷼');
  });
});
