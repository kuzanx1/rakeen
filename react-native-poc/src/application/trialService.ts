import { supabase } from '../infrastructure/supabaseClient';
import { TrialStatus, clockOffset, trialLocked } from '../domain/trial';

/**
 * حالة الفترة التجريبية -- نفس get_trial_status اللي يناديها كاشير الويب
 * ولوحة المطعم، فما فيه نسخة ثانية من القاعدة.
 *
 * الخادم يرفض الطلب الجديد بعد القفل أصلاً، بس الرفض لازم يصير قبل البيع:
 * طلب يوصل الخادم ويُرفض يبقى في طابور المزامنة (ما ينحذف)، والكاشير يحسبه
 * انحفظ ويكمّل يبيع.
 */
let current: TrialStatus | null = null;
let offset = 0;
const listeners = new Set<(s: TrialStatus | null) => void>();

export function getTrialStatus(): TrialStatus | null {
  return current;
}

export function getTrialClockOffset(): number {
  return offset;
}

export function isTrialLocked(): boolean {
  return trialLocked(current, Date.now(), offset);
}

export function subscribeTrial(fn: (s: TrialStatus | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** بدون نت أو قبل تشغيل الـ migration: تبقى الحالة كما هي، ولا شي ينقفل. */
export async function refreshTrialStatus(): Promise<TrialStatus | null> {
  try {
    const { data, error } = await supabase.rpc('get_trial_status');
    if (error || !data) return current;
    current = data as TrialStatus;
    offset = clockOffset(current, Date.now());
    listeners.forEach(fn => fn(current));
  } catch {
    /* يبقى على آخر حالة */
  }
  return current;
}
