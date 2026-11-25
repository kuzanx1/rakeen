import {
  emptyPrinterProfile,
  profileToPrinterTarget,
  profileToKitchenPrinterTarget,
  kitchenPrinterGaps,
} from '../src/domain/printerProfile';
import type { PrinterProfile } from '../src/platform/printer';

/**
 * طابعةُ المطبخ المنفصلة: شبكةً وبلوتوثاً وUSB.
 *
 * وكانت شبكةً فقط، منقولاً قيدُها من كاشير الويب -- وهو هناك قيدُ
 * المتصفّح، لا قرارَ منتج. فمطعمٌ طابعتُه الرئيسية USB ومطبخُه بلوتوث
 * (ومنفذُ USB واحدٌ في الجهاز) لم يكن يملك طريقاً لاختيار الثانية.
 */

/** طابعةٌ رئيسيّةٌ صالحة، فالمرجعُ إليها عند كلِّ نقصٍ في المطبخ. */
function mainNetwork(): PrinterProfile {
  return { ...emptyPrinterProfile(), host: '192.168.1.50', port: 9100 };
}
function mainUsb(): PrinterProfile {
  return { ...emptyPrinterProfile(), transport: 'usb', usbAccessoryId: 'usb-main', host: '', port: undefined };
}

describe('طابعة المطبخ -- ما كان يعمل يبقى كما هو', () => {
  /* الأهمُّ في الباب كلِّه: ملفٌّ محفوظٌ على جهازِ مطعمٍ قبل اليوم ليس
     فيه kitchenTransport أصلاً. فلو تغيّر قراءتُه لتحوّلت تذاكرُ مطابخَ
     قائمةٍ إلى طابعةِ الكاشير بين ليلةٍ وضحاها، بلا أن يغيّر أحدٌ شيئاً. */
  test('عنوانٌ ومنفذٌ بلا kitchenTransport = شبكة، كما قبل', () => {
    const p: PrinterProfile = { ...mainNetwork(), kitchenHost: '192.168.1.51', kitchenPort: 9100 };
    expect(profileToKitchenPrinterTarget(p)).toEqual({ transport: 'network', host: '192.168.1.51', port: 9100 });
  });

  test('عنوانٌ فارغٌ بلا kitchenTransport = طابعةُ الكاشير، كما قبل', () => {
    const p: PrinterProfile = { ...mainNetwork(), kitchenHost: '', kitchenPort: undefined };
    expect(profileToKitchenPrinterTarget(p)).toEqual(profileToPrinterTarget(p));
  });

  test('عنوانٌ بلا منفذٍ لا يصير هدفاً -- القاعدةُ القديمة تشترط الاثنين', () => {
    const p: PrinterProfile = { ...mainNetwork(), kitchenHost: '192.168.1.51', kitchenPort: undefined };
    expect(profileToKitchenPrinterTarget(p)).toEqual(profileToPrinterTarget(p));
  });

  test('بلا ملفٍّ أصلاً = لا هدف', () => {
    expect(profileToKitchenPrinterTarget(null)).toBeNull();
  });
});

describe('طابعة المطبخ -- الطرق الثلاث', () => {
  test('بلوتوث', () => {
    const p: PrinterProfile = { ...mainNetwork(), kitchenTransport: 'bluetooth', kitchenBluetoothId: 'AA:BB:CC' };
    expect(profileToKitchenPrinterTarget(p)).toEqual({ transport: 'bluetooth', bluetoothId: 'AA:BB:CC' });
  });

  test('USB', () => {
    const p: PrinterProfile = { ...mainNetwork(), kitchenTransport: 'usb', kitchenUsbAccessoryId: 'usb-kitchen' };
    expect(profileToKitchenPrinterTarget(p)).toEqual({ transport: 'usb', usbAccessoryId: 'usb-kitchen' });
  });

  test('شبكةٌ صريحة', () => {
    const p: PrinterProfile = { ...mainNetwork(), kitchenTransport: 'network', kitchenHost: '10.0.0.9', kitchenPort: 9100 };
    expect(profileToKitchenPrinterTarget(p)).toEqual({ transport: 'network', host: '10.0.0.9', port: 9100 });
  });

  /* حالةُ كباب طارق: الرئيسيةُ USB والمطبخُ بلوتوث، ومنفذُ USB واحدٌ
     في الجهاز. وهذا بالضبط ما كان محجوباً. */
  test('رئيسيّةٌ USB ومطبخٌ بلوتوث = هدفان مختلفان', () => {
    const p: PrinterProfile = { ...mainUsb(), kitchenTransport: 'bluetooth', kitchenBluetoothId: 'AA:BB:CC' };
    const kitchen = profileToKitchenPrinterTarget(p);
    const main = profileToPrinterTarget(p);
    expect(main).toEqual({ transport: 'usb', usbAccessoryId: 'usb-main' });
    expect(kitchen).toEqual({ transport: 'bluetooth', bluetoothId: 'AA:BB:CC' });
    expect(kitchen).not.toEqual(main);
  });
});

describe('نقصُ إعدادِ المطبخ لا يُسكت فاتورةَ الزبون', () => {
  /* العطبُ الذي تمنعه هذه: لو دخل تحقّقُ المطبخ في
     validatePrinterProfile لرجع profileToPrinterTarget فارغاً، فنصفُ
     إعدادٍ لمطبخٍ يوقف طباعةَ فواتير الزبائن كلِّها -- عطبٌ أكبرُ من
     الذي يُبلَّغ عنه، وفي موضعٍ لا يخطر ببال من ضبط المطبخ. */
  test.each([
    ['bluetooth', { kitchenTransport: 'bluetooth' as const }],
    ['usb', { kitchenTransport: 'usb' as const }],
    ['network', { kitchenTransport: 'network' as const }],
  ])('مطبخٌ %s ناقص: الرئيسيّةُ تبقى صالحة', (_kind, patch) => {
    const p: PrinterProfile = { ...mainNetwork(), ...patch };
    expect(profileToPrinterTarget(p)).toEqual({ transport: 'network', host: '192.168.1.50', port: 9100 });
  });

  test.each([
    ['bluetooth', { kitchenTransport: 'bluetooth' as const }],
    ['usb', { kitchenTransport: 'usb' as const }],
    ['network', { kitchenTransport: 'network' as const }],
  ])('مطبخٌ %s ناقص: التذكرةُ تطلع على طابعة الكاشير، لا تضيع', (_kind, patch) => {
    const p: PrinterProfile = { ...mainNetwork(), ...patch };
    expect(profileToKitchenPrinterTarget(p)).toEqual(profileToPrinterTarget(p));
  });
});

describe('ما ينقص يُقال', () => {
  test('«نفس طابعة الكاشير» بلا نقص', () => {
    expect(kitchenPrinterGaps(mainNetwork())).toEqual([]);
  });

  test('بلوتوثٌ بلا جهازٍ مختار', () => {
    const p: PrinterProfile = { ...mainNetwork(), kitchenTransport: 'bluetooth' };
    expect(kitchenPrinterGaps(p)).toHaveLength(1);
    expect(kitchenPrinterGaps({ ...p, kitchenBluetoothId: 'AA:BB:CC' })).toEqual([]);
  });

  test('USB بلا جهازٍ مختار', () => {
    const p: PrinterProfile = { ...mainNetwork(), kitchenTransport: 'usb' };
    expect(kitchenPrinterGaps(p)).toHaveLength(1);
    expect(kitchenPrinterGaps({ ...p, kitchenUsbAccessoryId: 'usb-kitchen' })).toEqual([]);
  });

  test('شبكةٌ بلا عنوانٍ ولا منفذ: نقصان', () => {
    const p: PrinterProfile = { ...mainNetwork(), kitchenTransport: 'network', kitchenHost: '', kitchenPort: undefined };
    expect(kitchenPrinterGaps(p)).toHaveLength(2);
  });

  test('منفذٌ خارج المدى يُقال', () => {
    const p: PrinterProfile = { ...mainNetwork(), kitchenTransport: 'network', kitchenHost: '10.0.0.9', kitchenPort: 70000 };
    expect(kitchenPrinterGaps(p)).toHaveLength(1);
  });
});
