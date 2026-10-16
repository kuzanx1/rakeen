/**
 * الفترة التجريبية: 350 طلب من الكاشير والمتجر مع بعض، بعد الحد مهلة 24
 * ساعة، ثم البيع ينقفل (supabase/migrations/20261016090000).
 *
 * القاعدة نفسها في كاشير الويب (rakeen-pos.js trialLockedNow) والشكل نفسه
 * اللي ترجعه get_trial_status. هنا بلا أي I/O عشان تنختبر.
 */
export interface TrialStatus {
  subscribed: boolean;
  used: number;
  limit: number;
  remaining: number;
  reached_at: string | null;
  locks_at: string | null;
  locked: boolean;
  /** ساعة الخادم وقت القراءة */
  now?: string;
}

/** ساعة الخادم ناقص ساعة الجهاز: جهاز ساعته غلط ما يقفل بدري ولا يتأخر. */
export function clockOffset(status: TrialStatus, deviceNow: number): number {
  const server = status.now ? Date.parse(status.now) : NaN;
  return Number.isFinite(server) ? server - deviceNow : 0;
}

export function trialLocked(status: TrialStatus | null, deviceNow: number, offset: number): boolean {
  if (!status || status.subscribed) return false;
  if (status.locked) return true;
  if (!status.locks_at) return false;
  return deviceNow + offset >= Date.parse(status.locks_at);
}

export function trialHoursLeft(status: TrialStatus, deviceNow: number, offset: number): number {
  if (!status.locks_at) return 0;
  return Math.max(0, Math.ceil((Date.parse(status.locks_at) - deviceNow - offset) / 3_600_000));
}

/** نص الشريط فوق الكاشير، أو null لما ما يحتاج شريط. */
export function trialNotice(
  status: TrialStatus | null,
  deviceNow: number,
  offset: number,
): { danger: boolean; text: string } | null {
  if (!status || status.subscribed) return null;
  if (trialLocked(status, deviceNow, offset)) {
    return { danger: true, text: 'انتهت الفترة التجريبية — تواصل معنا عشان تكمل البيع' };
  }
  if (status.reached_at) {
    return {
      danger: true,
      text: `خلصت طلبات الفترة التجريبية — البيع يتوقف بعد ${trialHoursLeft(status, deviceNow, offset)} ساعة. تواصل معنا`,
    };
  }
  if (status.remaining <= 50) {
    return { danger: false, text: `باقي ${status.remaining} طلب في الفترة التجريبية` };
  }
  return null;
}

export const TRIAL_SUBSCRIBE_WA = 'https://wa.me/966557444227';
