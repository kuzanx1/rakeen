import { isOverTypedPhoneTail } from '../src/domain/customer';
import { formatOfflineRef } from '../src/application/offlineRefService';

/**
 * ملاحظات السنمي على 1.16:
 * - الرقم التاسع بحقل الجوال كان يحذف أول رقم بدل ما يُرفض.
 * - رقم الطلب بلا نت كان «م-1 (مؤقت)»، صار OF01 مرتّب.
 */
describe('isOverTypedPhoneTail', () => {
  it('يرفض رقماً تاسعاً مكتوباً بعد ٨ أرقام مكتملة', () => {
    expect(isOverTypedPhoneTail('55744422', '557444227')).toBe(true);
  });

  it('يقبل الكتابة قبل ما يكتمل الرقم', () => {
    expect(isOverTypedPhoneTail('5574442', '55744422')).toBe(false);
  });

  it('يقبل اللصق (رقم كامل بـ 05 أو 966) فيمرّ على التنظيف', () => {
    expect(isOverTypedPhoneTail('55744422', '0557444227')).toBe(false);
    expect(isOverTypedPhoneTail('', '966557444227')).toBe(false);
  });

  it('يقبل المسح من رقم مكتمل', () => {
    expect(isOverTypedPhoneTail('55744422', '5574442')).toBe(false);
  });
});

describe('formatOfflineRef', () => {
  it('OF + رقمين على الأقل، بالترتيب', () => {
    expect(formatOfflineRef(1)).toBe('OF01');
    expect(formatOfflineRef(9)).toBe('OF09');
    expect(formatOfflineRef(12)).toBe('OF12');
    expect(formatOfflineRef(105)).toBe('OF105');
  });
});
