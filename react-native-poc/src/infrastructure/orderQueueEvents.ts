/**
 * تغيّر طابور الطلبات (انحفظ طلب بلا نت، أو ارتفع للخادم).
 *
 * شاشة الطلبات تسمع لهذا بدل ما تسأل كل شوي: الطلب اللي ينحفظ بلا نت
 * يطلع فوراً في «بانتظار الإرسال»، ولما يرتفع ينتقل لقائمته -- بلا مؤقّت.
 */
const listeners = new Set<() => void>();

export function onOrderQueueChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitOrderQueueChanged(): void {
  listeners.forEach(fn => {
    try {
      fn();
    } catch {
      // مستمع واحد ما يوقف الباقي.
    }
  });
}
