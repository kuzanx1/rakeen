/**
 * سجلُّ الأداء والانهيارات -- ليقول العطلُ اسمَه بنفسه.
 *
 * البطءُ يُبلَّغ عنه بالوصف: "أحياناً يعلّق"، "فجأةً ينهار". والوصفُ لا
 * يُصلَح -- والبحثُ عنه في الشيفرة تخمينٌ يصيب ويخيب، وقد أخطأتُ به
 * مرّةً وقلتُ إنّ السطحَ شفّافٌ وهو ممسوحٌ أبيض.
 *
 * فيُسجَّل ما يقع: كلُّ عمليةٍ تجاوزت حدَّها، وكلُّ خطأٍ لم يُلتقط. ثم
 * تُقرأ من شاشة التشخيص، فيُعرف أيُّ خطوةٍ بالضبط أخذت ثلاثَ ثوان،
 * وأيُّ سطرٍ رمى.
 *
 * ورخيصٌ عمداً: حلقةٌ في الذاكرة بحدٍّ أعلى، بلا شبكةٍ ولا قرصٍ في
 * المسار الساخن -- أداةُ قياسٍ تُبطئ ما تقيسه تكذب عليه.
 */

export interface PerfEntry {
  at: number;
  /** اسمُ الخطوة -- 'payment', 'catalog:load', 'receipt:render' ... */
  label: string;
  ms: number;
}

export interface ErrorEntry {
  at: number;
  message: string;
  where: string;
}

/** ما دون هذا لا يُسجَّل: إطارٌ واحد عند ٦٠/ث ستّةَ عشرَ ملّي. */
const SLOW_MS = 120;
const MAX_PERF = 60;
const MAX_ERRORS = 40;

const perf: PerfEntry[] = [];
const errors: ErrorEntry[] = [];

function push<T>(arr: T[], item: T, cap: number): void {
  arr.push(item);
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}

/** يُسجَّل الزمنُ إن تجاوز الحدّ، ويُهمل إن كان سريعاً. */
export function recordDuration(label: string, ms: number): void {
  if (ms < SLOW_MS) return;
  push(perf, { at: Date.now(), label, ms: Math.round(ms) }, MAX_PERF);
}

/**
 * يقيس عمليةً ويُعيد نتيجتها كما هي.
 *
 * ولا يبتلع خطأً: ما رمى يُسجَّل ويُعاد رميُه -- أداةُ قياسٍ تُخفي
 * الأخطاء أسوأ من ألّا تكون.
 */
export async function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } catch (e) {
    recordError(e, label);
    throw e;
  } finally {
    recordDuration(label, Date.now() - t0);
  }
}

export function recordError(e: unknown, where: string): void {
  const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  push(errors, { at: Date.now(), message: message.slice(0, 300), where }, MAX_ERRORS);
}

export function readPerf(): PerfEntry[] {
  return [...perf].reverse();
}

export function readErrors(): ErrorEntry[] {
  return [...errors].reverse();
}

export function clearPerfLog(): void {
  perf.length = 0;
  errors.length = 0;
}

/**
 * يلتقط ما لا يلتقطه أحد: الرفضُ غير المُعالَج.
 *
 * وعدٌ يُرفض بلا catch لا يُسقط تطبيق React Native، إنما يمرّ صامتاً --
 * فتبقى شاشةٌ على دوّارتها ولا شيء يقول لماذا. والالتقاطُ هنا لا يغيّر
 * السلوك، إنما يترك أثراً.
 */
export function installGlobalErrorTaps(): void {
  const g = globalThis as unknown as {
    __rkPerfTapsInstalled?: boolean;
    HermesInternal?: unknown;
    process?: { on?: (ev: string, cb: (r: unknown) => void) => void };
  };
  if (g.__rkPerfTapsInstalled) return;
  g.__rkPerfTapsInstalled = true;

  try {
    g.process?.on?.('unhandledRejection', (reason: unknown) => {
      recordError(reason, 'unhandledRejection');
    });
  } catch {
    // بيئةٌ بلا process: لا شيء يُفقد غير هذا الالتقاط.
  }
}
