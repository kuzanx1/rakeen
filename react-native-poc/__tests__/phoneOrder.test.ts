import {
  PHONE_PLATFORM_ID,
  PHONE_PLATFORM_LABEL,
  defaultDeliverySourceId,
  isPhoneOrderRow,
  isPhonePlatform,
  platformIdForServer,
  platformLabelOf,
} from '../src/domain/phoneOrder';
import { bilingualOrderKind } from '../src/domain/receiptPrintable';

/**
 * «جوال» زرٌّ في صفِّ تطبيقات التوصيل، ولا صفَّ له في قاعدة البيانات.
 * فما يُحفظ منه قناةٌ وأربعةُ أرقام، وما يُقرأ منه بعد الحفظ اسمٌ.
 */
describe('طلبُ الجوال', () => {
  it('معرّفُه لا يُرسل للخادم أبداً', () => {
    expect(platformIdForServer(PHONE_PLATFORM_ID)).toBeNull();
    expect(platformIdForServer(null)).toBeNull();
    expect(platformIdForServer(undefined)).toBeNull();
  });

  it('ومعرّفُ تطبيقٍ حقيقيّ يمرّ كما هو', () => {
    expect(platformIdForServer(29)).toBe(29);
    expect(platformIdForServer(7)).toBe(7);
  });

  it('يُعرف من زرّه', () => {
    expect(isPhonePlatform(PHONE_PLATFORM_ID)).toBe(true);
    expect(isPhonePlatform(29)).toBe(false);
    expect(isPhonePlatform(null)).toBe(false);
  });

  it('ويُقرأ من الطلب المحفوظ: توصيلٌ بلا منصّةٍ ومعه أربعة = جوال', () => {
    expect(platformLabelOf({ channel: 'delivery', platformInvoiceLast4: '7788' })).toBe(PHONE_PLATFORM_LABEL);
    expect(platformLabelOf({ channel: 'delivery', platformName: 'كيتا', platformInvoiceLast4: '4421' })).toBe('كيتا');
  });

  it('وطلبُ توصيلٍ قديمٌ بلا أربعةٍ ما يصير «جوال»', () => {
    expect(platformLabelOf({ channel: 'delivery' })).toBe('');
    expect(platformLabelOf({ channel: 'delivery', platformInvoiceLast4: null })).toBe('');
  });

  it('ولا طلبُ الاستلام أو الصالة', () => {
    expect(platformLabelOf({ channel: 'pickup', platformInvoiceLast4: '7788' })).toBe('');
    expect(platformLabelOf({ channel: 'dine_in' })).toBe('');
  });
});

/**
 * العلامةُ التي يُعرف بها طلبُ الجوال بعد حفظه.
 *
 * المالُ هو العلامة، لا آخرُ أربعة: طلبُ المنصّة مدفوعٌ في تطبيقها
 * فيُحفظ 'delivery_platform' دائماً -- وكذلك كان كلُّ طلب توصيلٍ قبل
 * «جوال» بلا استثناء -- وطلبُ الجوال يُدفع هنا. فما دُفع عندنا وما له
 * منصّة، جوال. (الطلب ٥٧: توصيل، كاش، بلا منصّةٍ وبلا أربعة -- كان
 * يُقرأ «توصيل» عارياً.)
 */
describe('قراءةُ طلب الجوال من صفِّه المحفوظ', () => {
  const row = (o: Parameters<typeof isPhoneOrderRow>[0]) => isPhoneOrderRow(o);

  it('توصيلٌ بلا منصّةٍ مدفوعٌ عندنا = جوال، ولو بلا أربعة', () => {
    expect(row({ channel: 'delivery', paymentMethod: 'cash', source: 'pos' })).toBe(true);
    expect(row({ channel: 'delivery', paymentMethod: 'card', source: 'pos' })).toBe(true);
    expect(row({ channel: 'delivery', paymentMethod: 'split', source: 'pos' })).toBe(true);
    expect(platformLabelOf({ channel: 'delivery', paymentMethod: 'cash' })).toBe(PHONE_PLATFORM_LABEL);
  });

  it('وطلبُ المنصّة ليس جوالاً -- مدفوعٌ في تطبيقها', () => {
    expect(row({ channel: 'delivery', paymentMethod: 'delivery_platform', source: 'pos' })).toBe(false);
    expect(row({ channel: 'delivery', paymentMethod: 'cash', deliveryPlatformId: 29 })).toBe(false);
    expect(row({ channel: 'delivery', paymentMethod: 'cash', platformName: 'كيتا' })).toBe(false);
  });

  it('ولا طلبُ التوصيل القديم -- كلُّه كان «مدفوعٌ عبر التطبيق»', () => {
    expect(row({ channel: 'delivery', paymentMethod: 'delivery_platform' })).toBe(false);
    expect(platformLabelOf({ channel: 'delivery', paymentMethod: 'delivery_platform' })).toBe('');
  });

  it('ولا طلبُ المتجر الإلكتروني ولو كان كاشاً عند الاستلام', () => {
    expect(row({ channel: 'delivery', paymentMethod: 'cash', source: 'online' })).toBe(false);
    expect(platformLabelOf({ channel: 'delivery', paymentMethod: 'cash', source: 'online' })).toBe('');
  });

  it('ولا سفريٌّ ولا محليّ', () => {
    expect(row({ channel: 'pickup', paymentMethod: 'cash' })).toBe(false);
    expect(row({ channel: 'dine_in', paymentMethod: 'cash' })).toBe(false);
  });

  it('ومن لا يقرأ طريقةَ الدفع تبقى له الأربعةُ علامةً', () => {
    expect(row({ channel: 'delivery', platformInvoiceLast4: '7788' })).toBe(true);
    expect(row({ channel: 'delivery' })).toBe(false);
  });
});

/**
 * ما يُفتح عليه صفُّ المصادر. وهو الذي أخطأ: مطعمٌ بلا تطبيقاتٍ ضغط
 * «توصيل» ودفع، فحُفظ الطلبُ بلا مصدر -- لا منصّةً ولا «جوال» ولا
 * آخرَ أربعة -- فقُرئ في اللوحة «توصيل» عارياً (الطلب ٥٧).
 */
describe('المصدرُ المختارُ ابتداءً', () => {
  it('أوّلُ تطبيقٍ حين توجد تطبيقات', () => {
    expect(defaultDeliverySourceId([29, 7], true)).toBe(29);
    expect(defaultDeliverySourceId([29, 7], false)).toBe(29);
  });

  it('و«جوال» حين لا تطبيقَ ولا مصدرَ غيرُه', () => {
    expect(defaultDeliverySourceId([], true)).toBe(PHONE_PLATFORM_ID);
  });

  it('ولا شيءَ حين لا تطبيقَ ولا جوال -- فالقناةُ نفسُها لا تُعرض', () => {
    expect(defaultDeliverySourceId([], false)).toBeNull();
  });

  it('ولا يُبدَّل اختيارٌ قائم', () => {
    expect(defaultDeliverySourceId([29, 7], true, PHONE_PLATFORM_ID)).toBe(PHONE_PLATFORM_ID);
    expect(defaultDeliverySourceId([29, 7], true, 7)).toBe(7);
    expect(defaultDeliverySourceId([], true, 29)).toBe(29);
  });

  it('وما يُفتح عليه الصفُّ يصل الخادمَ مصدراً معروفاً -- لا توصيلاً عارياً', () => {
    // مطعمٌ بلا تطبيقات: المختارُ «جوال»، فيُرسل بلا معرّفٍ ومعه الأربعة.
    const noApps = defaultDeliverySourceId([], true);
    expect(isPhonePlatform(noApps)).toBe(true);
    expect(platformIdForServer(noApps)).toBeNull();
    expect(platformLabelOf({ channel: 'delivery', platformInvoiceLast4: '5566' })).toBe(PHONE_PLATFORM_LABEL);

    // ومطعمٌ له تطبيقات: المختارُ أوّلُها، فيُرسل بمعرّفه.
    expect(platformIdForServer(defaultDeliverySourceId([29, 7], true))).toBe(29);
  });
});

/**
 * «جوال» نوعُ طلبٍ على الورق، لا صفةٌ تحت «توصيل» -- واختارَه صاحبُ
 * المطعم: الطلبُ بالهاتف غالباً يجيء صاحبُه فيستلمه بنفسه.
 */
describe('نوعُ الطلب على الورق', () => {
  it('«جوال» تُطبع بلغتين مثل سائر الأنواع', () => {
    expect(bilingualOrderKind('جوال')).toBe('جوال · Phone');
  });

  it('ولا تمسّ الأنواعَ الأخرى', () => {
    expect(bilingualOrderKind('توصيل')).toBe('توصيل · Delivery');
    expect(bilingualOrderKind('سفري')).toBe('سفري · Takeaway');
    expect(bilingualOrderKind('محلي — طاولة 7')).toBe('محلي · Dine-in — طاولة 7');
  });
});
