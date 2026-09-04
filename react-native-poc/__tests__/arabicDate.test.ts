import {
  formatArabicTime,
  formatArabicDateTime,
  formatArabicDateTimeShort,
  formatArabicDateTimeWithWeekday,
} from '../src/domain/arabicDate';

/**
 * The crash these guard against is a THROW, not a wrong string: Hermes can
 * raise a RangeError from toLocaleString('ar-SA') when a build lacks the
 * locale data, and a throw during render terminates a release build. So
 * the cases that matter are the ones where the formatter is broken.
 */
const FORMATTERS = [
  ['formatArabicTime', formatArabicTime],
  ['formatArabicDateTime', formatArabicDateTime],
  ['formatArabicDateTimeShort', formatArabicDateTimeShort],
  ['formatArabicDateTimeWithWeekday', formatArabicDateTimeWithWeekday],
] as const;

describe('arabic date formatting', () => {
  const date = new Date('2026-09-04T15:48:00');

  it.each(FORMATTERS)('%s returns something for a real date', (_name, fn) => {
    expect(fn(date).length).toBeGreaterThan(0);
  });

  it.each(FORMATTERS)('%s never throws on an invalid date', (_name, fn) => {
    expect(() => fn(new Date('not a date'))).not.toThrow();
    expect(fn(new Date('not a date'))).toBe('—');
  });

  describe('when Intl throws, as it does on a build without ar-SA data', () => {
    const realDateTime = Date.prototype.toLocaleString;
    const realTime = Date.prototype.toLocaleTimeString;

    beforeEach(() => {
      Date.prototype.toLocaleString = function () {
        throw new RangeError('Incorrect locale information provided');
      };
      Date.prototype.toLocaleTimeString = function () {
        throw new RangeError('Incorrect locale information provided');
      };
    });
    afterEach(() => {
      Date.prototype.toLocaleString = realDateTime;
      Date.prototype.toLocaleTimeString = realTime;
    });

    it.each(FORMATTERS)('%s falls back instead of throwing', (_name, fn) => {
      expect(() => fn(date)).not.toThrow();
      expect(fn(date).length).toBeGreaterThan(0);
    });

    it('keeps the actual time', () => {
      expect(formatArabicTime(date)).toBe('15:48');
    });

    it('keeps the full date and time', () => {
      expect(formatArabicDateTime(date)).toBe('04/09/2026 15:48');
    });

    it('still names the weekday from its own table', () => {
      // 2026-09-04 is a Friday.
      expect(formatArabicDateTimeWithWeekday(date)).toBe('الجمعة، 04/09 15:48');
    });
  });
});
