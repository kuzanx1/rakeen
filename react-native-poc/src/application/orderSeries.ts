/**
 * الوردية المفتوحة بهالجهاز = سلسلة أرقام فرعه الحالية.
 *
 * رقم الطلب يرجع ١ مع كل وردية (20261115120000_shift_order_numbers.sql)،
 * والرقم المؤقت بلا نت (OF01) مثله. ملف صغير بلا اعتماديات: يقرأه
 * orderNumberPool و offlineRefService، ويكتبه App.tsx كل ما تغيّرت الوردية.
 */
let currentSeries: number | null = null;

export function setOrderNumberSeries(shiftId: number | null | undefined): void {
  if (shiftId != null && shiftId > 0) currentSeries = shiftId;
}

export function currentOrderSeries(): number | null {
  return currentSeries;
}
