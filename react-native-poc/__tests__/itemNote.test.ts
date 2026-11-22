import { KITCHEN, WEIGHT, PAPER, layoutKitchenTicket, stubMeasure } from '../../shared/receipt';
import type { DrawOp, KitchenTicketModel, ReceiptItem, TextOp } from '../../shared/receipt';
import { buildKitchenTicketEscPosBase64 } from '../src/domain/receipt';

/**
 * ملاحظةُ الصنف -- الشيءُ الوحيد على ورقة المطبخ الذي يُغيّر التحضير.
 *
 * أبلغ مطعمٌ (٢٠٢٦/١١/٢٠) شكايتين: أنها تُطبع أحياناً ولا تُطبع
 * أحياناً، وأنها -- حين تُطبع -- صغيرةٌ لا تُقرأ من بعيد.
 *
 * فأمّا «أحياناً» فموضعُها لحظةُ الكتابة لا لحظةُ الطباعة، وتُحرس في
 * tools/accounting-checks/item-note-capture.cjs لأنها حالةُ شاشةٍ في
 * عميلين. وأمّا ما يُقاس هنا فاثنان: أن الملاحظةَ أكبرُ من الإضافة في
 * التخطيط المشترك، وأنها لا تسقط من ملاذِ الحروف اللاتينية حين يسقط
 * رسمُ الصورة -- وكانت تسقط منه، تذكرةٌ بأصنافٍ عارية.
 */

const item = (over: Partial<ReceiptItem> = {}): ReceiptItem => ({
  name: 'برجر طارق',
  nameEn: 'Tariq Burger',
  qty: 2,
  unitPrice: 25,
  lineTotal: 50,
  mods: ['جبن زيادة'],
  note: null,
  ...over,
});

const ticket = (over: Partial<KitchenTicketModel> = {}): KitchenTicketModel => ({
  branchName: 'الفرع الرئيسي',
  dateLabel: '2026/11/20 — 13:05',
  metaLabel: 'محلي',
  orderNumber: '41',
  cashierName: 'عمّار',
  items: [item()],
  ...over,
});

const layout = (model: KitchenTicketModel) =>
  layoutKitchenTicket({ ticket: model, measure: stubMeasure, paperWidth: PAPER.mm80 });

const texts = (ops: DrawOp[]): TextOp[] => ops.filter((o): o is TextOp => o.op === 'text');

const find = (ops: DrawOp[], startsWith: string): TextOp | undefined =>
  texts(ops).find(t => t.text.startsWith(startsWith));

describe('ملاحظةُ الصنف على ورقة المطبخ', () => {
  it('تُطبع، وبحجمٍ أكبر من الإضافة', () => {
    const { ops } = layout(ticket({ items: [item({ note: 'بدون بصل' })] }));
    const note = find(ops, 'ملاحظات');
    const mod = find(ops, '—');

    expect(note).toBeDefined();
    expect(mod).toBeDefined();
    expect(note!.text).toContain('بدون بصل');
    expect(note!.size).toBeGreaterThan(mod!.size);
    expect(note!.size).toBe(KITCHEN.note);
  });

  it('وبسماكةِ الاسم -- لا بسماكةِ النصّ العاديّ', () => {
    const { ops } = layout(ticket({ items: [item({ note: 'حار جداً' })] }));
    const note = find(ops, 'ملاحظات')!;
    expect(note.weight).toBe(WEIGHT.bold);
    expect(note.weight).toBeGreaterThan(WEIGHT.regular);
  });

  it('ولا تبلغ حجمَ اسم الصنف -- فالاسمُ يُقرأ أوّلاً', () => {
    const { ops } = layout(ticket({ items: [item({ note: 'بدون مخلل' })] }));
    const name = find(ops, '2x')!;
    const note = find(ops, 'ملاحظات')!;
    expect(note.size).toBeLessThan(name.size);
  });

  it('والطويلةُ تُلفّ في أسطر، ولا سطرَ منها يخرج عن الورقة', () => {
    const long = 'حساسية من المكسرات — نظّف السطح قبل التحضير ولا تستخدم نفس السكين';
    const { ops, width } = layout(ticket({ items: [item({ note: long })] }));
    const lines = texts(ops).filter(t => t.size === KITCHEN.note);

    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) {
      const w = stubMeasure(l.text, l.size, l.weight, l.family);
      expect(l.x - w).toBeGreaterThanOrEqual(0);
      expect(l.x).toBeLessThanOrEqual(width);
    }
  });

  it('وصنفٌ بلا ملاحظةٍ لا يطبع سطراً فارغاً', () => {
    const { ops } = layout(ticket({ items: [item({ note: null })] }));
    expect(find(ops, 'ملاحظات')).toBeUndefined();
  });
});

/** يفكّ base64 ثم يقرأ البايتات حرفاً حرفاً -- المسارُ لاتينيٌّ أصلاً. */
function decodeAscii(b64: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const ch of b64) {
    if (ch === '=') break;
    acc = (acc << 6) | chars.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((acc >> bits) & 0xff);
    }
  }
  return out;
}

describe('ملاذُ الحروف اللاتينية (حين يسقط رسمُ الصورة)', () => {
  const build = (note: string | null) =>
    decodeAscii(
      buildKitchenTicketEscPosBase64({
        orderId: 41,
        orderNo: 41,
        tableNumber: null,
        lines: [
          {
            name: 'Tariq Burger',
            qty: 2,
            unitPrice: 25,
            lineTotal: 50,
            mods: ['Extra cheese'],
            note: note ?? undefined,
          },
        ],
      } as Parameters<typeof buildKitchenTicketEscPosBase64>[0]),
    );

  it('يحمل الملاحظة', () => {
    expect(build('No onion')).toContain('No onion');
  });

  it('ويحمل الإضافات معها', () => {
    expect(build('No onion')).toContain('Extra cheese');
  });

  it('ويبقى الصنفُ وكميتُه على ما كانا', () => {
    expect(build(null)).toContain('2 x Tariq Burger');
  });

  it('وبلا ملاحظةٍ لا يطبع علامتَها', () => {
    expect(build(null)).not.toContain('*');
  });
});
