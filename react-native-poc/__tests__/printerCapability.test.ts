import { mirrorRuns, arabicLineFor, resolveCapabilities, DEFAULT_CAPABILITIES } from '../src/domain/printerCapability';

/**
 * Tests the thing that actually matters: what a person reading the paper
 * sees.
 *
 * An earlier version of these tests only checked that mirroring twice
 * returns the original. That is true of any reversal, including wrong
 * ones, so it passed while "الفرع الرئيسي" was printing as "الرئيسي
 * الفرع". A symmetry check cannot detect a wrong symmetry.
 *
 * `asRead` below models the reader instead: the printer lays tokens down
 * left to right in the order it receives them, and a person reads that
 * paper right to left, with any embedded English phrase read left to
 * right. If asRead(mirror(x)) === x, the paper says what was meant.
 */

/**
 * What a human reads off paper printed by a shaping-only printer.
 *
 * The inverse of mirrorRuns, and the neutral rule has to be its mirror
 * too: a token with no letters ("|", "-", "#302") attaches to the run
 * BEFORE it when the line is built in logical order, so it attaches to the
 * run AFTER it when the same line is read back in visual order. Using the
 * same side in both directions made the test disagree with correct code —
 * the model was wrong, not the mirror.
 */
function asRead(sent: string): string {
  type Run = { kind: 'ar' | 'latin'; words: string[] };
  const tokens = sent.split(' ');
  const runs: Run[] = [];
  const pendingNeutral: string[] = [];

  for (const w of tokens) {
    const hasArabic = /[؀-ۿ]/.test(w);
    const hasLatin = /[A-Za-z]/.test(w);
    if (!hasArabic && !hasLatin) { pendingNeutral.push(w); continue; }
    const kind: Run['kind'] = hasArabic ? 'ar' : 'latin';
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.words.push(...pendingNeutral, w);
    else runs.push({ kind, words: [...pendingNeutral, w] });
    pendingNeutral.length = 0;
  }
  if (pendingNeutral.length && runs.length) runs[runs.length - 1].words.push(...pendingNeutral);

  return runs
    .reverse()
    .map(r => (r.kind === 'ar' ? [...r.words].reverse() : r.words).join(' '))
    .join(' ');
}

describe('mirrorRuns() — what reaches the paper', () => {
  // Labels are single-language now, so the mixed cases here are the ones
  // that come from the owner's own data and cannot be simplified away:
  // a bilingual business name, a bilingual product, an address.
  const cases = [
    'الفرع الرئيسي',
    'حي البيعة - الطائف',
    'شكراً لزيارتكم',
    'هَبيّة | Hbiah',
    'كولومبي حار | Colombian Hot',
    'سبانيش لاتيه بارد',
    'رقم الطلب 302',
    'Latte 15.00',
  ];

  it.each(cases)('reads back exactly as intended: %s', line => {
    expect(asRead(mirrorRuns(line))).toBe(line);
  });

  it('keeps an English phrase running left to right', () => {
    // Reversing word by word turned this into "Hot Colombian": correct
    // Arabic, broken English, and invisible in any single-word test.
    expect(mirrorRuns('كولومبي حار | Colombian Hot')).toContain('Colombian Hot');
  });

  it('reverses the words inside an Arabic run', () => {
    // The printer lays them out left to right, so they must arrive
    // backwards to read forwards.
    expect(mirrorRuns('الفرع الرئيسي')).toBe('الرئيسي الفرع');
  });

  it('leaves a line with no Arabic completely alone', () => {
    expect(mirrorRuns('Latte 15.00')).toBe('Latte 15.00');
  });
});

describe('arabicLineFor() — capability decides, never the renderer', () => {
  const caps = (arabic: 'native' | 'shapingOnly' | 'none') => ({
    ...DEFAULT_CAPABILITIES,
    arabic,
  });

  it('sends untouched text to a printer that orders Arabic itself', () => {
    // Mirroring here would break a receipt that was already correct --
    // which is exactly what a global reverseWords() would have done.
    expect(arabicLineFor('الفرع الرئيسي', caps('native'))).toBe('الفرع الرئيسي');
  });

  it('mirrors for a printer that shapes but does not order', () => {
    expect(arabicLineFor('الفرع الرئيسي', caps('shapingOnly'))).toBe('الرئيسي الفرع');
  });

  it('asks the caller to rasterise when the printer has no Arabic', () => {
    expect(arabicLineFor('الفرع الرئيسي', caps('none'))).toBeNull();
  });

  it('never rasterises a line that has no Arabic in it', () => {
    // A Latin-only line prints fine on every one of the three.
    expect(arabicLineFor('Latte 15.00', caps('none'))).toBe('Latte 15.00');
  });
});

describe('resolveCapabilities()', () => {
  it('defaults an unknown printer to the strategy that cannot corrupt', () => {
    // Slower, but an untested printer must never be assumed to speak
    // Arabic: guessing wrong prints unreadable receipts to real customers.
    expect(resolveCapabilities(null).arabic).toBe('none');
  });

  it('uses the measured profile for the printer that was actually tested', () => {
    expect(resolveCapabilities('sunmi-nt310').arabic).toBe('shapingOnly');
  });

  it('lets a configured paper width override the profile', () => {
    // The roll in the machine is the one thing the owner can verify.
    expect(resolveCapabilities('sunmi-nt310', 384).printableDots).toBe(384);
  });
});
