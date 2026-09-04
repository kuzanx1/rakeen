import { supabase } from '../infrastructure/supabaseClient';
import { getItem, setItem } from '../infrastructure/mmkvStorage';
import { computeShiftTotals, EMPTY_SHIFT_TOTALS } from '../domain/shift';
import type { CashMovement, ClosingReport, Shift, ShiftOrderRow, ShiftTotals } from '../domain/shift';
import { formatArabicDateTime } from '../domain/arabicDate';

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
  /** shifts.staff_member_id. The cashier_id is the SHARED branch account,
   *  so this is the only column saying which human opened the drawer. */
  staffMemberId: number | null;
  openingCash: number;
}

export async function openShift(input: OpenShiftInput): Promise<{ shift: Shift | null; error: string | null }> {
  const { data, error } = await supabase
    .from('shifts')
    .insert({
      business_id: input.businessId,
      branch_id: input.branchId,
      cashier_id: input.cashierId,
      staff_member_id: input.staffMemberId,
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
export interface RecordCashMovementInput {
  shift: Shift;
  direction: 'in' | 'out';
  amount: number;
  reason: string;
  staffMemberId: number | null;
}

/** Insert-only by design (see the migration): a movement is part of the
 *  audit trail behind a signed-off balance, so a mistake is corrected by
 *  recording the opposite movement, not by editing history. */
export async function recordCashMovement(
  input: RecordCashMovementInput,
): Promise<{ ok: boolean; error: string | null }> {
  const { data: userData } = await supabase.auth.getUser();
  const createdBy = userData?.user?.id;
  if (!createdBy) return { ok: false, error: 'انتهت الجلسة — سجّل الدخول مرة ثانية' };
  const { error } = await supabase.from('shift_cash_movements').insert({
    shift_id: input.shift.id,
    business_id: input.shift.business_id,
    branch_id: input.shift.branch_id,
    direction: input.direction,
    amount: Math.abs(input.amount),
    reason: input.reason.trim(),
    staff_member_id: input.staffMemberId,
    created_by: createdBy,
  });
  if (error) return { ok: false, error: 'تعذر تسجيل الحركة — تحقق من الاتصال وجرّب مرة ثانية' };
  return { ok: true, error: null };
}

export async function listCashMovements(shiftId: number): Promise<CashMovement[]> {
  const { data } = await supabase
    .from('shift_cash_movements')
    .select('direction, amount, reason')
    .eq('shift_id', shiftId)
    .order('created_at');
  return (data || []).map((m: any) => ({
    direction: m.direction === 'in' ? 'in' : 'out',
    amount: Number(m.amount) || 0,
    reason: String(m.reason || ''),
  }));
}

export async function loadShiftTotals(shift: Shift | null): Promise<ShiftTotals> {
  if (!shift) return EMPTY_SHIFT_TOTALS;
  const { data } = await supabase
    .from('orders')
    .select('total, payment_method, cash_amount')
    .eq('shift_id', shift.id)
    .eq('payment_status', 'paid')
    // Refunds. refund_pos_order sets status='refunded' and never touches
    // payment_status -- which cannot hold 'refunded' at all, its check
    // constraint allows 'unpaid'/'paid' only. Without this exclusion a
    // refunded cash sale keeps counting toward "expected in drawer" while
    // the money has physically been handed back, so the count comes up
    // short by exactly the refunded amount and an honest cashier looks
    // like they are missing cash on the figure a manager signs off.
    // 'cancelled' needs no exclusion: cancel_dine_in_order only matches
    // payment_status='unpaid', so those never reach this query.
    .neq('status', 'refunded');
  // A missing table (migration not run yet) must not stop a shift being
  // read or closed -- it just means no movements are recorded.
  const movements = await listCashMovements(shift.id).catch(() => [] as CashMovement[]);
  return computeShiftTotals((data as ShiftOrderRow[]) || [], Number(shift.opening_cash), movements);
}

/**
 * The closing time that applies TODAY.
 *
 * A branch_weekly_hours row for today's weekday wins over the branch's
 * default pair; a weekday with no row keeps the default. That is what
 * makes the override list short -- a place that only differs on Friday
 * stores one row, not seven.
 *
 * A day marked closed returns null, which makes the stale check fall back
 * to its age limit. Deliberate: "we are shut today" says nothing about
 * when the shift that is open should have ended, so guessing a closing
 * time from a closed day would be inventing one.
 *
 * The weekly table may not exist yet (migration not run), so a failure
 * there falls through to the branch default rather than breaking login.
 */
export async function getBranchClosingTime(branchId: number): Promise<string | null> {
  const { data: branch } = await supabase
    .from('branches')
    .select('closing_time')
    .eq('id', branchId)
    .single();
  const fallback = branch?.closing_time ?? null;

  try {
    // extract(dow): 0 = Sunday .. 6 = Saturday, matching getDay().
    const { data, error } = await supabase
      .from('branch_weekly_hours')
      .select('closing_time, is_closed')
      .eq('branch_id', branchId)
      .eq('weekday', new Date().getDay())
      .maybeSingle();
    if (error || !data) return fallback;
    if (data.is_closed) return null;
    return data.closing_time ?? fallback;
  } catch {
    return fallback;
  }
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
    dateLabel: formatArabicDateTime(new Date(String(row.created_at))),
    // The source prints an em dash here: the report row records who closed
    // it as a user id, not a display name.
    staffName: '—',
    ordersCount: Number(row.orders_count) || 0,
    salesTotal: Number(row.sales_total) || 0,
    cardTotal: Number(row.card_total) || 0,
    deliveryPlatformTotal: Number(row.delivery_platform_total) || 0,
    // Not stored on the report row -- an older slip simply reprints
    // without these two lines rather than inventing figures for them.
    cashIn: 0,
    cashOut: 0,
    cashExpected: Number(row.cash_expected) || 0,
    cashCounted: Number(row.cash_counted) || 0,
    cashVariance: Number(row.cash_variance) || 0,
  };
}
