import { rtl, buildTextReceipt } from '../src/domain/escposTextReceipt';
import { EscPosText } from '../src/domain/escposText';

/**
 * Locks the one transformation this printer needs, and the one it must
 * never get.
 *
 * The behaviour these assert was established by printing a probe slip on
 * the real SUNMI NT310 at Hbiah, then reproducing that exact slip in the
 * simulator: sending "مرحبا بك" printed "بك مرحبا", and the simulator
 * says the same. So these are pinned to measured hardware behaviour, not
 * to a reading of a spec.
 *
 * They exist because both mistakes are silent. Reverse too little and
 * every receipt reads backwards; reverse the letters as well and every
 * word turns to nonsense while still looking like Arabic from a distance.
 */

/**
 * UTF-8 bytes back to a string.
 *
 * Hand-rolled rather than Buffer or TextDecoder: neither is in this
 * project's TypeScript lib set, and a test that needs a new @types
 * dependency to read four bytes is a test that will rot.
 */
const decode = (bytes: number[]): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b < 0xe0) { out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f)); }
    else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
    } else {
      const cp = ((b & 0x07) << 18) | ((bytes[++i] & 0x3f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
};

describe('rtl()', () => {
  it('reverses word ORDER so the printer can mirror it back', () => {
    // The printer lays words down left to right in the order received.
    // Sending them reversed is what makes the paper read right to left.
    expect(rtl('مرحبا بك')).toBe('بك مرحبا');
    expect(rtl('الفرع الرئيسي')).toBe('الرئيسي الفرع');
  });

  it('never touches the letters inside a word', () => {
    // The printer shapes each word correctly from its logical order.
    // Pre-reversing characters would break exactly the thing it gets right.
    for (const word of ['مرحبا', 'قهوة', 'الإجمالي']) {
      expect(rtl(word)).toBe(word);
    }
  });

  it('is its own inverse, which is what makes the round trip work', () => {
    const line = 'المجموع الفرعي 80.00';
    expect(rtl(rtl(line))).toBe(line);
  });

  it('leaves a pure Latin line alone', () => {
    // Latin already prints correctly; mirroring it would break it.
    expect(rtl('Latte 15.00')).toBe('Latte 15.00');
    expect(rtl('RAKEEN TEXT TEST')).toBe('RAKEEN TEXT TEST');
  });
});

describe('buildTextReceipt()', () => {
  const receipt = {
    businessName: 'هَبيّة',
    branchName: 'الفرع الرئيسي',
    tagline: '', locationLine: '', branchLabel: '', cashierName: '', showBusinessName: true,
    dateLabel: '5 سبتمبر 2026',
    orderNumber: '313',
    metaLabel: 'محلي',
    vatNumber: '',
    items: [{ name: 'لاتيه', qty: 1, unitPrice: 15, lineTotal: 15, mods: [], nameEn: '', note: '' }],
    subtotal: 15,
    discount: 0,
    vat: 0,
    total: 15,
    paymentMethodLabel: 'كاش',
    change: 0,
    customMessage: 'شكراً',
    timestampISO: '2026-09-05T02:00:00.000Z',
    paperWidthPx: 576,
  } as Parameters<typeof buildTextReceipt>[0];

  /**
   * Reads a byte stream back the way the paper reads.
   *
   * Walks the stream and skips command sequences by their real lengths.
   * Stripping control characters alone is not enough: `ESC E 0` loses the
   * ESC and leaves a literal 'E' inside a word, and the test then fails on
   * debris rather than on anything real.
   */
  const asRead = (bytes: number[]): string[] => {
    const out: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0x1b && bytes[i + 1] === 0x40) { i += 1; continue; }
      if (b === 0x1b && (bytes[i + 1] === 0x61 || bytes[i + 1] === 0x45)) { i += 2; continue; }
      if (b === 0x1d && (bytes[i + 1] === 0x21 || bytes[i + 1] === 0x56)) { i += 2; continue; }
      if (b === 0x1d && bytes[i + 1] === 0x28 && bytes[i + 2] === 0x6b) {
        i += 4 + (bytes[i + 3] | (bytes[i + 4] << 8));
        continue;
      }
      out.push(b);
    }
    return decode(out)
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean)
      .map((l: string) => (/[؀-ۿ]/.test(l) ? l.split(/\s+/).reverse().join(' ') : l));
  };

  it('reads correctly in Arabic once the printer has mirrored it', () => {
    const lines = asRead(buildTextReceipt(receipt));
    expect(lines).toContain('الفرع الرئيسي');
    expect(lines.some(l => l.startsWith('1 لاتيه'))).toBe(true);
    expect(lines.some(l => l.includes('الإجمالي') && l.includes('15.00'))).toBe(true);
  });

  it('prints money in Latin digits, never Arabic-Indic', () => {
    // A price that prints 15.00 as ٠٠.٥١ is worse than a slow receipt.
    const text = decode(buildTextReceipt(receipt));
    expect(text).toContain('15.00');
    expect(text).not.toMatch(/[٠-٩]/);
  });

  it('stays a fraction of the raster payload', () => {
    // The whole point: the raster receipt for this shop measured 48.8 KB.
    expect(buildTextReceipt(receipt).length).toBeLessThan(4096);
  });
});

describe('EscPosText', () => {
  it('starts with the init command so a previous job cannot bleed in', () => {
    const bytes = new EscPosText().line('x').build();
    expect(bytes.slice(0, 2)).toEqual([0x1b, 0x40]);
  });

  it('encodes Arabic as UTF-8, not as question marks', () => {
    const bytes = new EscPosText().line('قهوة').build();
    expect(decode(bytes)).toContain('قهوة');
  });
});
