import {
  Subscription,
  subscriptionDayMonth,
  subscriptionPillKey,
  subscriptionTone,
  fillDays,
  subscriptionBigKey,
  subscriptionWhenKey,
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

  /* المثنّى في العربيّة كلمةٌ لا رقم، والقلّةُ من ثلاثةٍ إلى عشرةٍ جمعٌ
     والكثرةُ بعدها مفردٌ، و«One day» ليست «1 days» -- فلكلِّ صيغةٍ
     مفتاحُها، وإلا طلع «1 يوم» ثم «5 يوم» في وجه صاحب المطعم. */
  it('الرقمُ الكبير بصيغةٍ صحيحةٍ في الطرفين', () => {
    expect(subscriptionBigKey(sub(24))).toBe('{n} يوم');
    expect(subscriptionBigKey(sub(11))).toBe('{n} يوم');
    expect(subscriptionBigKey(sub(10))).toBe('{n} أيام');
    expect(subscriptionBigKey(sub(3))).toBe('{n} أيام');
    expect(subscriptionBigKey(sub(2))).toBe('يومان');
    expect(subscriptionBigKey(sub(1))).toBe('يوم واحد');
    expect(subscriptionBigKey(sub(0))).toBe('اليوم');
    expect(subscriptionBigKey(sub(-1))).toBe('يوم تأخير');
    expect(subscriptionBigKey(sub(-2))).toBe('يومان تأخير');
    expect(subscriptionBigKey(sub(-3))).toBe('{n} أيام تأخير');
    expect(subscriptionBigKey(sub(-10))).toBe('{n} أيام تأخير');
    expect(subscriptionBigKey(sub(-11))).toBe('{n} يوم تأخير');
  });

  /* وما يُعرض فعلاً بعد الترجمةِ والتعبئة: «5 أيام» لا «5 يوم»، فالغلطُ
     النحويُّ لا يُرى في المفتاح، يُرى في السطرِ الذي يقرؤه المالك. */
  it('والسطرُ المعروضُ نفسُه صحيح', () => {
    expect(fillDays(subscriptionBigKey(sub(5)), 5)).toBe('5 أيام');
    expect(fillDays(subscriptionBigKey(sub(-4)), 4)).toBe('4 أيام تأخير');
    expect(fillDays(subscriptionBigKey(sub(15)), 15)).toBe('15 يوم');
  });

  /* والمستنتَجُ (status = projected) يُقرأ كأيِّ موعدٍ قادم: ليس ديناً
     متأخّراً ولا تحت المراجعة، إنما متى تدور الدورةُ القادمة. */
  it('الموعدُ المستنتَجُ من دورةِ العقد يُقرأ عادياً', () => {
    expect(subscriptionTone(sub(98, 'projected'))).toBe('ok');
    expect(subscriptionTone(sub(4, 'projected'))).toBe('soon');
    expect(subscriptionWhenKey(sub(98, 'projected'))).toBe('يُجدَّد');
    expect(subscriptionBigKey(sub(98, 'projected'))).toBe('{n} يوم');
  });

  it('والسطرُ الصغير يقول متى لا كم', () => {
    expect(subscriptionWhenKey(sub(24))).toBe('يُجدَّد');
    expect(subscriptionWhenKey(sub(0))).toBe('موعد التجديد');
    expect(subscriptionWhenKey(sub(-3))).toBe('كان يوم التجديد');
  });

  it('التاريخُ يُقرأ بلا Date ولا منطقةٍ زمنيّةٍ تزحزح اليوم', () => {
    expect(subscriptionDayMonth('2026-12-15')).toBe('15/12');
    expect(subscriptionDayMonth('2027-01-01')).toBe('01/01');
    // وما لا يُفهم يُعرض كما جاء، ولا يُرمى خطأ في وجه الكاشير.
    expect(subscriptionDayMonth('')).toBe('');
  });
});
