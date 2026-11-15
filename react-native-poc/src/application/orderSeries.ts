/**
 * يوم العمل الحالي = سلسلة أرقام الطلبات.
 *
 * رقم الطلب يرجع ١ مع بداية كل يوم عمل (20261115120000_shift_order_numbers.sql).
 * يوم العمل يقفل بساعة المحل (businesses.day_cutoff_hour، بالرياض) مو ١٢
 * الليل: مقهى يقفل ٢ الفجر يومه [٤ الفجر ← ٤ الفجر]. الساعة توصل مع حجز
 * الأرقام (r_day_cutoff)، فيعرف الجهاز يومه بلا نت.
 *
 * ملف صغير بلا اعتماديات: يقرأه orderNumberPool و offlineRefService.
 */
let cutoffHour: number | null = null;

export function setDayCutoffHour(h: number | null | undefined): void {
  if (h != null && Number.isFinite(Number(h)) && Number(h) >= 0 && Number(h) <= 23) cutoffHour = Number(h);
}

export function dayCutoffHour(): number | null {
  return cutoffHour;
}

/** تاريخ يوم العمل YYYYMMDD -- نفس rk_business_day_key في القاعدة. */
export function businessDayKey(cutoff: number, at: number = Date.now()): number {
  // السعودية UTC+3 بلا توقيت صيفي.
  const d = new Date(at + 3 * 3600_000 - cutoff * 3600_000);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/**
 * بداية يوم العمل (ms). قوائم «طلبات اليوم» (الجارية، البيجر) تبدأ منها: مقهى
 * يقفل ٢ الفجر ما تختفي طلباته المعلّقة الساعة ١٢. ما نعرف الساعة؟ ١٢ الليل.
 */
export function businessDayStartMs(at: number = Date.now()): number {
  if (cutoffHour == null) {
    const d = new Date(at);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const shift = 3 * 3600_000 - cutoffHour * 3600_000;
  return Math.floor((at + shift) / 86400_000) * 86400_000 - shift;
}

/** null = ما نعرف ساعة الإقفال بعد (ما انحجز شي): ما يُرمى شي. */
export function currentOrderSeries(): number | null {
  return cutoffHour == null ? null : businessDayKey(cutoffHour);
}
