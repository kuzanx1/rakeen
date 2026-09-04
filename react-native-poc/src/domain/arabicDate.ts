/**
 * Every Arabic date/time string in the app, formatted so it cannot take
 * the app down.
 *
 * receiptPrintable.ts already worked this out for the receipt: Hermes
 * (React Native's JS engine) does not always ship full ICU/Intl locale
 * data, so `toLocaleString('ar-SA', ...)` can throw a RangeError on some
 * builds -- something the browser-only PWA never had to consider. The
 * receipt was wrapped in try/catch; nine other call sites were not.
 *
 * That is not a cosmetic gap. A throw inside render, in a release build
 * with no error boundary, terminates the app -- and the un-guarded calls
 * sat in exactly the screens a cashier hits: the stale-shift screen, the
 * closing wizard, the topbar clock, order history. The stale-shift screen
 * was the worst of them, being the only place in the whole app asking for
 * `weekday: 'long'`, the option most likely to need locale data a given
 * build does not carry.
 *
 * Every helper here degrades instead of throwing, and never loses the
 * information: the fallbacks build the same value by hand in Western
 * digits rather than showing nothing.
 */

const AR_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const pad = (n: number) => String(n).padStart(2, '0');

/** DD/MM/YYYY HH:MM, always available. */
function manualDateTime(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

/** An unparseable date must not reach a formatter at all. */
function isValid(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/** HH:MM -- the topbar clock, an order's time, a shift's opening time. */
export function formatArabicTime(date: Date): string {
  if (!isValid(date)) return '—';
  try {
    return date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

/** DD/MM/YYYY HH:MM in Arabic-Indic digits where the build can, by hand
 *  where it cannot. */
export function formatArabicDateTime(date: Date): string {
  if (!isValid(date)) return '—';
  try {
    return date.toLocaleString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return manualDateTime(date);
  }
}

/** The locale's own default date+time layout. */
export function formatArabicDateTimeShort(date: Date): string {
  if (!isValid(date)) return '—';
  try {
    return date.toLocaleString('ar-SA');
  } catch {
    return manualDateTime(date);
  }
}

/**
 * With the weekday named -- "الخميس، 04/09 03:48".
 *
 * Two fallbacks, not one: `weekday` is the option most likely to be the
 * single unsupported piece, so a failure first retries WITHOUT it and
 * prepends the day name from a local table, keeping the sentence intact.
 * Only if that fails too does it fall back to the fully manual form.
 */
export function formatArabicDateTimeWithWeekday(date: Date): string {
  if (!isValid(date)) return '—';
  try {
    return date.toLocaleString('ar-SA', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    const day = AR_WEEKDAYS[date.getDay()] ?? '';
    try {
      const rest = date.toLocaleString('ar-SA', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      return day ? `${day}، ${rest}` : rest;
    } catch {
      const rest = `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      return day ? `${day}، ${rest}` : rest;
    }
  }
}
