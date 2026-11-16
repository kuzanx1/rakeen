/**
 * «حوّلت انقلش وفيه أشياء باقية عربي» -- the owner, November 2026, after
 * finding Arabic buttons, settings and order details on an English till.
 *
 * Translation is a table lookup at <Text>; a string missing from the table
 * stays Arabic and nothing errors. So the gate is here: every Arabic
 * literal in the app needs an entry (see scripts/i18n-coverage.js for
 * what is exempt and why), and the lookup itself must handle the shapes
 * the screens actually render.
 */
import { lookupEn } from '../src/ui/i18n';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findMissing } = require('../scripts/i18n-coverage.js');

describe('every Arabic UI string has English', () => {
  it('has no string missing from the table', () => {
    const missing: { file: string; line: number; text: string }[] = findMissing();
    const report = missing.map(m => `${m.file}:${m.line}  ${m.text}`).join('\n');
    expect(report).toBe('');
  });
});

describe('lookupEn', () => {
  it('translates a whole entry', () => {
    expect(lookupEn('افتح الدرج')).toBe('Open drawer');
  });

  it('fills placeholders, translating what they captured', () => {
    expect(lookupEn('باقي 5 طلب في الفترة التجريبية')).toBe('5 trial orders left');
    expect(lookupEn('متوفرة في باقة عماد')).toBe('Available on the Emad plan');
    expect(lookupEn('تم قبول الطلب #42')).toBe('Order #42 accepted');
  });

  it('prefers the more specific placeholder key', () => {
    // «باقي {}» alone would also match this sentence.
    expect(lookupEn('باقي 3 أرقام')).toBe('3 digits left');
  });

  it('translates labels glued together in code, piece by piece', () => {
    expect(lookupEn('سفري · كاش')).toBe('Takeaway · Cash');
  });

  it('never rewrites part of a name', () => {
    // A product called «قهوة تركية» is not a table entry; nothing inside it
    // may be translated on its own.
    expect(lookupEn('قهوة تركية')).toBeUndefined();
    expect(lookupEn('سموذي مانجو · قهوة تركية')).toBeUndefined();
    // A glued label keeps the name as written and translates only the
    // piece that is an entry.
    expect(lookupEn('قهوة تركية · سفري')).toBe('قهوة تركية · Takeaway');
  });
});
