/**
 * Checkpoint 13 (Diagnostics, final) -- ported from the real PWA's own
 * diagnoseProblem() (public/pos/rakeen-pos.js). Answers "is the problem
 * internet, cloud, the printer bridge, or the printer itself" in the
 * exact order a real cashier would want ruled out (closest to them
 * first: internet, then cloud, then whether a native bridge exists AT
 * ALL, then the printer itself once a bridge is actually present) --
 * never collapsed into one combined "everything is fine/broken" signal.
 * Zero I/O.
 */

export interface Diagnosis {
  text: string;
  bad: boolean;
}

/**
 * `internet`/`cloud` are tri-state (`true`/`false`/`null`) on purpose --
 * `null` means "not yet known" (NetInfo hasn't reported, or no real
 * sync round-trip has happened yet this session to observe a cloud
 * result from), and must NOT be treated as "definitely broken." Only an
 * explicit `false` is a confirmed problem, exactly mirroring the PWA's
 * own `NETWORK_STATE.cloud === false` check (not a bare falsy check,
 * which would have wrongly caught `null` too).
 */
export function diagnoseProblem(
  internet: boolean | null,
  cloud: boolean | null,
  bridgeAvailable: boolean,
  troublePrintCount: number,
): Diagnosis {
  if (internet === false) {
    return { text: 'المشكلة: الجهاز مو متصل بالإنترنت إطلاقًا.', bad: true };
  }
  if (cloud === false) {
    return { text: 'المشكلة: الإنترنت شغال لكن ما نقدر نوصل لحساب المطعم — جرّب بعد شوي.', bad: true };
  }
  if (!bridgeAvailable) {
    return {
      text: 'ملاحظة: الطباعة غير متاحة على هذا الجهاز.',
      bad: false,
    };
  }
  if (troublePrintCount > 0) {
    return {
      text: 'المشكلة: الطابعة — تأكد إنها مشغّلة، وفيها ورق، وعلى نفس شبكة الواي فاي.',
      bad: true,
    };
  }
  return { text: 'لا توجد مشكلة ظاهرة الآن.', bad: false };
}
