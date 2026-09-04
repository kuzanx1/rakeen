/**
 * Stage-by-stage timing for one print job.
 *
 * Every performance claim made about this pipeline so far -- mine
 * included -- was an argument from plausibility. The transport already
 * carried a trace, which is the only reason the 20ms connect-to-ack
 * figure is a fact rather than a guess; nothing upstream of it was
 * measured at all, so "the render is fast" and "base64 is cheap" were
 * both assertions.
 *
 * This closes that. Each stage is stamped as it happens and the summary
 * is attached to the job's own diagnostics, so it shows up in the same
 * place a cashier already photographs when something is wrong -- no
 * console, no debug build, no cable.
 *
 * Deliberately not a general profiler: a fixed set of named stages that
 * match the pipeline as it actually runs, so two runs are comparable and
 * a regression is visible as a number moving rather than as a feeling.
 */

export type PrintStage =
  | 'profileRead'
  | 'themeRead'
  | 'fontsReady'
  | 'logoLoad'
  | 'canvasDraw'
  | 'pixelsRead'
  | 'escposBuild'
  | 'base64'
  | 'transport';

const ORDER: PrintStage[] = [
  'profileRead',
  'themeRead',
  'fontsReady',
  'logoLoad',
  'canvasDraw',
  'pixelsRead',
  'escposBuild',
  'base64',
  'transport',
];

/** Short Arabic labels, because this is read on a till by an owner. */
const LABEL: Record<PrintStage, string> = {
  profileRead: 'قراءة الإعدادات',
  themeRead: 'شكل الفاتورة',
  fontsReady: 'تجهيز الخطوط',
  logoLoad: 'جلب الشعار',
  canvasDraw: 'رسم الفاتورة',
  pixelsRead: 'قراءة الصورة',
  escposBuild: 'بناء أوامر الطابعة',
  base64: 'تحويل للإرسال',
  transport: 'الإرسال للطابعة',
};

export class PrintTimer {
  private marks = new Map<PrintStage, number>();
  private readonly startedAt = Date.now();
  private payloadBytes = 0;

  /** Runs `fn`, records how long it took, returns its value untouched. */
  async stage<T>(name: PrintStage, fn: () => Promise<T> | T): Promise<T> {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      this.marks.set(name, (this.marks.get(name) ?? 0) + (Date.now() - t0));
    }
  }

  /** For a stage measured elsewhere -- the transport times itself. */
  record(name: PrintStage, ms: number): void {
    this.marks.set(name, ms);
  }

  bytes(n: number): void {
    this.payloadBytes = n;
  }

  get totalMs(): number {
    return Date.now() - this.startedAt;
  }

  /**
   * One line per stage that actually ran, plus the total and the payload
   * size. Zero-length stages are dropped: a line reading "0 ms" for a
   * logo that was never fetched is noise, and noise is what stops a
   * diagnostic being read.
   */
  summary(): string[] {
    const lines: string[] = [];
    for (const name of ORDER) {
      const ms = this.marks.get(name);
      if (ms === undefined) continue;
      lines.push(`${LABEL[name]}: ${ms} ms`);
    }
    lines.push(`الإجمالي داخل التطبيق: ${this.totalMs} ms`);
    if (this.payloadBytes > 0) {
      lines.push(`حجم البيانات: ${(this.payloadBytes / 1024).toFixed(1)} KB`);
    }
    return lines;
  }
}
