/** «١٠٪» أو «١٠ ﷼» -- نفس النص في زر الخصم والملخّص (rkDiscountLabel في الويب). */
export function discountLabel(pct: number, fixed: number): string {
  if (fixed > 0) return `${Number(fixed.toFixed(2))} ﷼`;
  return `${pct}٪`;
}
