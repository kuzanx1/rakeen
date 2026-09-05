import { toLatinDigits } from '../src/domain/digits';

/**
 * الكاشير كتب مبلغاً صحيحاً بلوحة جهازه العربية، فقيل له إنه خطأ.
 * هذه الاختبارات تثبّت أن الترجمة تقع قبل أي فحص.
 */
describe('toLatinDigits', () => {
  it('يترجم الأرقام العربية إلى لاتينية', () => {
    expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('يترجم الأرقام الفارسية أيضاً — لوحة أخرى، رقم واحد', () => {
    expect(toLatinDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('يجعل الفاصلة العربية نقطة عشرية', () => {
    expect(toLatinDigits('١٥٫٥٠')).toBe('15.50');
    expect(toLatinDigits('15,50')).toBe('15.50');
  });

  it('يمرّ اللاتيني كما هو — لا يفسد ما كان صحيحاً', () => {
    expect(toLatinDigits('15.50')).toBe('15.50');
    expect(toLatinDigits('')).toBe('');
  });

  it('ما يخرج منه يُقرأ رقماً', () => {
    expect(Number(toLatinDigits('٦٥'))).toBe(65);
    expect(Number(toLatinDigits('١٢٫٧٥'))).toBe(12.75);
    // وهذا هو ما كان يقع قبله.
    expect(Number('٦٥')).toBeNaN();
  });

  it('لا يمسّ ما ليس رقماً — عناوين الشبكة تمرّ سليمة', () => {
    expect(toLatinDigits('192.168.1.50')).toBe('192.168.1.50');
  });
});
