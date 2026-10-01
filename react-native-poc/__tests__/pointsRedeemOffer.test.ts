import { pointsRedeemOffer, redeemableCountText } from '../src/domain/customer';

/**
 * العميل نقاطُه تكفي لمنتج، والكاشير لا يدري إلا إن سأل.
 * هذه الاختبارات تثبّت متى يظهر الشريط وماذا يقول.
 */
describe('pointsRedeemOffer', () => {
  it('يعدّ ما تكفيه النقاط فقط', () => {
    expect(pointsRedeemOffer(50, [20, 50, 80], 0)).toEqual({ remaining: 50, count: 2 });
  });

  it('لا شريط حين لا تكفي النقاط لأي منتج', () => {
    expect(pointsRedeemOffer(10, [20, 50], 0)).toBeNull();
  });

  it('لا شريط بلا منتجات قابلة للاستبدال', () => {
    expect(pointsRedeemOffer(500, [null, undefined], 0)).toBeNull();
    expect(pointsRedeemOffer(500, [], 0)).toBeNull();
  });

  it('يطرح ما في السلّة من استبدال — فلا يُعرض ما سيرفضه الخادم', () => {
    expect(pointsRedeemOffer(50, [20, 50], 20)).toEqual({ remaining: 30, count: 1 });
    expect(pointsRedeemOffer(50, [20, 50], 40)).toBeNull();
  });

  it('سعر صفر ليس استبدالاً', () => {
    expect(pointsRedeemOffer(50, [0], 0)).toBeNull();
  });

  it('كسور النقاط لا تُحسب', () => {
    expect(pointsRedeemOffer(19.9, [20], 0)).toBeNull();
  });
});

describe('redeemableCountText', () => {
  it('مفرد ومثنى وجمع', () => {
    expect(redeemableCountText(1)).toBe('منتج واحد');
    expect(redeemableCountText(2)).toBe('منتجين');
    expect(redeemableCountText(5)).toBe('5 منتجات');
  });
});
