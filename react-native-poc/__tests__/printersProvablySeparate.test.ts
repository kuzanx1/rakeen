import { printersAreProvablySeparate } from '../src/domain/printerProfile';
import type { PrinterTarget } from '../src/platform/printer';

/**
 * الورقتان لا تُرسلان معاً إلّا إلى طابعتين مختلفتين **بيقين**.
 *
 * عند «كباب طارق»: طابعةُ الكاشير على USB، وطابعةُ المطبخ أُعطيت
 * عنواناً على الشبكة. فظنّهما الكودُ اثنتين لأنّ وصفَيهما يختلفان
 * نصّاً، وأرسل الورقتين في نفس اللحظة. وأكثرُ الطابعات الحراريّة فيها
 * المدخلان معاً، فجازَ أن يكون الهدفان بابَين لرأسٍ واحد -- فتتداخل
 * بايتاتُ التذكرة داخل صورة الفاتورة. التذكرةُ خرجت، والفاتورةُ
 * ابتُلعت، والتطبيق قال «نجحت» لأنّ البايتات خرجت من الكابل فعلاً.
 */

const describe_ = (t: PrinterTarget): string =>
  t.transport === 'network' ? `${t.host}:${t.port}` : t.transport === 'usb' ? `USB ${t.usbAccessoryId}` : `BLE ${t.bluetoothId}`;

const net = (host: string): PrinterTarget => ({ transport: 'network', host, port: 9100 });
const usb = (id: string): PrinterTarget => ({ transport: 'usb', usbAccessoryId: id });
const ble = (id: string): PrinterTarget => ({ transport: 'bluetooth', bluetoothId: id });

describe('طابعتان مختلفتان بيقين', () => {
  it('مدخلان مختلفان = لا يقين، ولو اختلف الوصف', () => {
    // الحالةُ التي كسرت: USB للكاشير وشبكةٌ للمطبخ.
    expect(printersAreProvablySeparate(usb('19267:14384'), net('192.168.8.250'), describe_)).toBe(false);
    expect(printersAreProvablySeparate(net('192.168.8.250'), usb('19267:14384'), describe_)).toBe(false);
    expect(printersAreProvablySeparate(usb('1110:2056'), ble('AA:BB:CC'), describe_)).toBe(false);
    expect(printersAreProvablySeparate(net('10.0.0.5'), ble('AA:BB:CC'), describe_)).toBe(false);
  });

  it('نفسُ المدخل وعنوانان = يقين', () => {
    expect(printersAreProvablySeparate(net('192.168.8.10'), net('192.168.8.250'), describe_)).toBe(true);
    expect(printersAreProvablySeparate(usb('1110:2056'), usb('19267:14384'), describe_)).toBe(true);
    expect(printersAreProvablySeparate(ble('AA:BB:CC'), ble('DD:EE:FF'), describe_)).toBe(true);
  });

  it('نفسُ المدخل ونفسُ العنوان = طابعةٌ واحدة', () => {
    expect(printersAreProvablySeparate(net('192.168.8.250'), net('192.168.8.250'), describe_)).toBe(false);
    expect(printersAreProvablySeparate(usb('1110:2056'), usb('1110:2056'), describe_)).toBe(false);
  });

  it('وناقصُ هدفٍ لا يُوازى عليه', () => {
    expect(printersAreProvablySeparate(null, net('192.168.8.250'), describe_)).toBe(false);
    expect(printersAreProvablySeparate(usb('1110:2056'), null, describe_)).toBe(false);
    expect(printersAreProvablySeparate(null, null, describe_)).toBe(false);
  });
});
