import { supabase } from '../infrastructure/supabaseClient';
import { getItem, setItem } from '../infrastructure/mmkvStorage';
import { computeShiftTotals, EMPTY_SHIFT_TOTALS } from '../domain/shift';
import type { ClosingReport, Shift, ShiftOrderRow, ShiftTotals } from '../domain/shift';

/**
 * The shift lifecycle, ported from rakeen-pos.js's own (findOpenShift at
 * :6255, the open handler at :6293, loadShiftData at :5388, the closing
 * wizard at :5467).
 */

const cacheKey = (cashierId: string) => `shift:${cashierId}`;

/**
 * The open shift for this cashier, or null when there genuinely is none.
 *
 * The error branch is not defensive padding -- it is a bug the source
 * already had and fixed, and its comment says so. supabase-js resolves
 * with `{data: null, error}` rather than throwing, so code that
 * destructures only `data` cannot tell "confirmed no open shift" apart
 * from "couldn't check". That made every offline boot land on the
 * open-shift screen and start a SECOND shift on top of a live one. Hence
 * the cache: a failed read falls back to the last known answer, and every
 * successful read overwrites it -- including with null, so a shift closed
 * while online cannot leave a stale "still open" entry behind.
 */
export async function findOpenShift(cashierId: string): Promise<Shift | null> {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('cashier_id', cashierId)
    .is('closed_at', null)
    .order('opened_at', { ascending: false })
    .limit(1);

  if (error) {
    try {
      const cached = await getItem(cacheKey(cashierId));
      return cached ? (JSON.parse(cached) as Shift | null) : null;
    } catch {
      return null;
    }
  }

  const shift = (data && (data[0] as Shift)) || null;
  try {
    await setItem(cacheKey(cashierId), JSON.stringify(shift));
  } catch {
    // No cache available for the next offline boot. Not fatal now.
  }
  return shift;
}

export interface OpenShiftInput {
  businessId: number;
  branchId: number;
  cashierId: string;
  openingCash: number;
}

export async function openShift(input: OpenShiftInput): Promise<{ shift: Shift | null; error: string | null }> {
  const { data, error } = await supabase
    .from('shifts')
    .insert({
      business_id: input.businessId,
      branch_id: input.branchId,
      cashier_id: input.cashierId,
      opening_cash: input.openingCash,
    })
    .select()
    .single();

  if (error || !data) return { shift: null, error: 'تعذر بدء الوردية — تحقق من الاتصال وجرّب مرة ثانية' };
  try {
    await setItem(cacheKey(input.cashierId), JSON.stringify(data));
  } catch {
    // see findOpenShift
  }
  return { shift: data as Shift, error: null };
}

/**
 * Totals for the open shift.
 *
 * `payment_status = 'paid'` is doing real work: it excludes a pay-after
 * dine-in table that is still mid-meal. Without it an open tab's total
 * would count toward the drawer before any money had actually changed
 * hands, and the cashier would be asked to account for cash nobody had
 * handed over yet.
 */
export async function loadShiftTotals(shift: Shift | null): Promise<ShiftTotals> {
  if (!shift) return EMPTY_SHIFT_TOTALS;
  const { data } = await supabase
    .from('orders')
    .select('total, payment_method, cash_amount')
    .eq('shift_id', shift.id)
    .eq('payment_status', 'paid');
  return computeShiftTotals((data as ShiftOrderRow[]) || [], Number(shift.opening_cash));
}

export interface CloseShiftInput {
  shift: Shift;
  countedCash: number;
  report: ClosingReport;
}

/**
 * Closes the shift and files its report.
 *
 * Order matters: the shift row is stamped closed FIRST, and only then is
 * the report inserted. If the report insert fails the shift is still
 * closed and the drawer still counted -- which is recoverable. The
 * reverse, a filed report for a shift that is still open, would let the
 * next sale land inside a shift that has already been signed off.
 */
export async function closeShift(input: CloseShiftInput): Promise<{ ok: boolean; error: string | null }> {
  const { error: updateError } = await supabase
    .from('shifts')
    .update({ closing_cash: input.countedCash, closed_at: new Date().toISOString() })
    .eq('id', input.shift.id);
  if (updateError) return { ok: false, error: 'تعذر إغلاق الوردية — تحقق من الاتصال وجرّب مرة ثانية' };

  try {
    const { data: userData } = await supabase.auth.getUser();
    const closedBy = userData?.user?.id;
    // shift_closing_reports.closed_by is NOT NULL and references
    // profiles(id), so sending null would be rejected outright and the
    // failure swallowed below -- leaving a closed shift with no report
    // and nothing said about it. Report the gap instead of hiding it.
    if (!closedBy) {
      return { ok: true, error: 'أُغلقت الوردية، لكن ما انحفظ تقرير الموازنة — سجّل الدخول وأعد الطباعة' };
    }
    await supabase.from('shift_closing_reports').insert({
      shift_id: input.shift.id,
      business_id: input.shift.business_id,
      branch_id: input.shift.branch_id,
      closed_by: closedBy,
      orders_count: input.report.ordersCount,
      sales_total: input.report.salesTotal,
      cash_expected: input.report.cashExpected,
      cash_counted: input.report.cashCounted,
      cash_variance: input.report.cashVariance,
      card_total: input.report.cardTotal,
      delivery_platform_total: input.report.deliveryPlatformTotal,
    });
  } catch {
    // The shift is closed and the count recorded on the shift row itself.
    // A missing report row means the reprint has nothing to fetch, not
    // that the close failed.
  }

  try {
    await setItem(cacheKey(input.shift.cashier_id), JSON.stringify(null));
  } catch {
    // see findOpenShift
  }
  return { ok: true, error: null };
}

/**
 * The most recent closing report for this branch, for reprinting.
 *
 * The source's reasoning for it existing at all: the report used to print
 * exactly once, automatically, at the moment of closing -- so a jammed or
 * empty printer lost it for good, since a closed shift has no session to
 * go back to. No manager approval is required, because this re-outputs
 * data that was already produced and approved rather than creating
 * anything new.
 */
export async function getLastClosingReport(
  branchId: number,
  businessName: string,
  branchName: string,
): Promise<ClosingReport | null> {
  const { data, error } = await supabase
    .from('shift_closing_reports')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  return {
    businessName: businessName || 'ركين',
    branchName: branchName || '',
    dateLabel: new Date(String(row.created_at)).toLocaleString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    // The source prints an em dash here: the report row records who closed
    // it as a user id, not a display name.
    staffName: '—',
    ordersCount: Number(row.orders_count) || 0,
    salesTotal: Number(row.sales_total) || 0,
    cardTotal: Number(row.card_total) || 0,
    deliveryPlatformTotal: Number(row.delivery_platform_total) || 0,
    cashExpected: Number(row.cash_expected) || 0,
    cashCounted: Number(row.cash_counted) || 0,
    cashVariance: Number(row.cash_variance) || 0,
  };
}
