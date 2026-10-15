import { clockOffset, trialHoursLeft, trialLocked, trialNotice, TrialStatus } from '../src/domain/trial';

const NOW = Date.parse('2026-10-16T12:00:00Z');
const base: TrialStatus = {
  subscribed: false,
  used: 100,
  limit: 350,
  remaining: 250,
  reached_at: null,
  locks_at: null,
  locked: false,
  now: '2026-10-16T12:00:00Z',
};

describe('الفترة التجريبية', () => {
  test('مشترك: ولا قفل ولا شريط', () => {
    const s = { ...base, subscribed: true, used: 900, remaining: 0, locked: true };
    expect(trialLocked(s, NOW, 0)).toBe(false);
    expect(trialNotice(s, NOW, 0)).toBeNull();
  });

  test('بدون حالة (بدون نت أو قبل الـ migration): ما ينقفل', () => {
    expect(trialLocked(null, NOW, 0)).toBe(false);
    expect(trialNotice(null, NOW, 0)).toBeNull();
  });

  test('باقي كثير: بدون شريط، وتحت 50 يطلع كم باقي', () => {
    expect(trialNotice(base, NOW, 0)).toBeNull();
    const n = trialNotice({ ...base, used: 320, remaining: 30 }, NOW, 0);
    expect(n?.text).toContain('باقي 30 طلب');
    expect(n?.danger).toBe(false);
  });

  test('وصل الحد: مهلة 24 ساعة، ثم ينقفل', () => {
    const s = { ...base, used: 350, remaining: 0, reached_at: '2026-10-16T02:00:00Z', locks_at: '2026-10-17T02:00:00Z' };
    expect(trialLocked(s, NOW, 0)).toBe(false);
    expect(trialHoursLeft(s, NOW, 0)).toBe(14);
    expect(trialNotice(s, NOW, 0)?.text).toContain('بعد 14 ساعة');
    expect(trialLocked(s, Date.parse('2026-10-17T02:00:00Z'), 0)).toBe(true);
  });

  test('الخادم قال مقفول: ينقفل حتى لو ساعة الجهاز متأخرة', () => {
    expect(trialLocked({ ...base, locked: true, remaining: 0 }, NOW, 0)).toBe(true);
  });

  test('ساعة الجهاز متأخرة ساعتين: الحساب على ساعة الخادم', () => {
    const deviceNow = NOW - 2 * 3600_000;
    const off = clockOffset(base, deviceNow);
    expect(off).toBe(2 * 3600_000);
    const s = { ...base, reached_at: '2026-10-15T12:00:00Z', locks_at: '2026-10-16T12:00:00Z', remaining: 0 };
    expect(trialLocked(s, deviceNow, 0)).toBe(false);
    expect(trialLocked(s, deviceNow, off)).toBe(true);
  });
});
