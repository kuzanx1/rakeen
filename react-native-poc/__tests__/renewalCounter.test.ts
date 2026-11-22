import {
  Subscription,
  subscriptionDayMonth,
  subscriptionPillKey,
  subscriptionTone,
  subscriptionUnitKey,
} from '../src/domain/renewal';

/**
 * عدّادُ الاشتراك الدائمُ في «المزيد».
 *
 * والخطُّ الفاصلُ المحروسُ هنا هو الحدُّ نفسُه الذي يبدأ عنده التذكير
 * (NOTICE_DAYS = ٦): عدّادٌ يصفرُّ في يومٍ والشريطُ ساكتٌ فيه -- أو
 * العكس -- يعني عميلين يقولان لصاحبِ المطعم شيئين مختلفين عن اشتراكٍ
 * واحد. ونفسُ الحدِّ في كاشير الويب يحرسه tools/accounting-checks.
 */

const sub = (days: number, status = 'due'): Subscription => ({ days, date: '2026-12-15', status });

describe('عدّاد الاشتراك', () => {
  it('هادئٌ ما دام الموعد بعيداً', () => {
    expect(subscriptionTone(sub(30))).toBe('ok');
    expect(subscriptionTone(sub(7))).toBe('ok');
  });

  it('يصفرُّ من اليوم السادس -- نفس حدِّ التذكير', () => {
    expect(subscriptionTone(sub(6))).toBe('soon');
    expect(subscriptionTone(sub(1))).toBe('soon');
    expect(subscriptionTone(sub(0))).toBe('soon');
  });

  it('يحمرُّ بعد الموعد', () => {
    expect(subscriptionTone(sub(-1))).toBe('late');
    expect(subscriptionTone(sub(-40))).toBe('late');
  });

  it('الإيصالُ تحت المراجعة يسبق كلَّ شيء -- ولو كان متأخّراً', () => {
    expect(subscriptionTone(sub(-3, 'submitted'))).toBe('review');
    expect(subscriptionPillKey(sub(-3, 'submitted'))).toBe('تحت المراجعة');
  });

  it('والمرفوضُ أحمرُ مهما بَعُد الموعد', () => {
    expect(subscriptionTone(sub(30, 'rejected'))).toBe('late');
    expect(subscriptionPillKey(sub(30, 'rejected'))).toBe('ارفع إيصال جديد');
  });

  it('السطرُ تحت الرقم يُكمل قراءتَه', () => {
    expect(subscriptionUnitKey(sub(24))).toBe('يوم على التجديد');
    expect(subscriptionUnitKey(sub(0))).toBe('هو يوم التجديد');
    expect(subscriptionUnitKey(sub(-3))).toBe('يوم تأخير');
  });

  it('التاريخُ يُقرأ بلا Date ولا منطقةٍ زمنيّةٍ تزحزح اليوم', () => {
    expect(subscriptionDayMonth('2026-12-15')).toBe('15/12');
    expect(subscriptionDayMonth('2027-01-01')).toBe('01/01');
    // وما لا يُفهم يُعرض كما جاء، ولا يُرمى خطأ في وجه الكاشير.
    expect(subscriptionDayMonth('')).toBe('');
  });
});
