import { businessDayKey, businessDayStartMs, setDayCutoffHour } from '../src/application/orderSeries';

// الرياض UTC+3. «2026-11-15T22:00:00Z» = ١ الفجر بالرياض ليلة الأحد ← الاثنين.
const at = (iso: string) => new Date(iso).getTime();

describe('يوم العمل', () => {
  it('١٢ الليل: بيع الساعة ١ الفجر من اليوم الجديد', () => {
    expect(businessDayKey(0, at('2026-11-15T22:00:00Z'))).toBe(20261116);
  });

  it('يقفل ٤ الفجر: بيع الساعة ١ الفجر من ليلته', () => {
    expect(businessDayKey(4, at('2026-11-15T22:00:00Z'))).toBe(20261115);
    // ٤:٠٠ الفجر بالضبط = يوم جديد
    expect(businessDayKey(4, at('2026-11-16T01:00:00Z'))).toBe(20261116);
    expect(businessDayKey(4, at('2026-11-16T00:59:59Z'))).toBe(20261115);
  });

  it('بداية اليوم = ساعة الإقفال بالرياض', () => {
    setDayCutoffHour(4);
    // ١ الفجر ليلة الأحد ← اليوم بدأ ٤ الفجر الأحد (٠١:٠٠Z)
    expect(new Date(businessDayStartMs(at('2026-11-15T22:00:00Z'))).toISOString()).toBe('2026-11-15T01:00:00.000Z');
    // ٥ العصر الأحد ← نفس اليوم
    expect(new Date(businessDayStartMs(at('2026-11-15T14:00:00Z'))).toISOString()).toBe('2026-11-15T01:00:00.000Z');
    setDayCutoffHour(0);
    expect(new Date(businessDayStartMs(at('2026-11-15T22:00:00Z'))).toISOString()).toBe('2026-11-15T21:00:00.000Z');
  });
});
