import { supabase } from '../infrastructure/supabaseClient';
import { RestaurantTable, TableSection, TableStatus } from '../domain/tables';

/**
 * Checkpoint 7 (Dine-in / Tables) — real Supabase wiring for the table
 * lifecycle. `register_dine_in_order`/`pay_dine_in_order` (Checkpoints
 * 5/6, unchanged) already do the money-moving table transitions
 * atomically server-side (available/awaiting_order -> serving on
 * register, -> cleaning on pay) — this file covers exactly the
 * transitions the PWA makes as PLAIN client-side guarded updates (no
 * RPC, no money involved): seating a walk-in, releasing a table before
 * any order was taken, and marking a table cleaned. Plus the two
 * table-management RPCs (`move_table_order`, `cancel_dine_in_order`)
 * that don't belong to order creation/payment.
 */

export async function listTables(branchId: number): Promise<RestaurantTable[]> {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .select('id, number, status, active_order_id, section_id, status_changed_at')
    .eq('branch_id', branchId);
  if (error) throw error;
  return data || [];
}

export async function listTableSections(branchId: number): Promise<TableSection[]> {
  const { data, error } = await supabase
    .from('table_sections')
    .select('id, name, sort_order')
    .eq('branch_id', branchId);
  if (error) throw error;
  return data || [];
}

/**
 * Race-safe conditional update — the exact same guard the PWA uses
 * (`.eq('status', expected)`), so two devices tapping the same table at
 * the same moment get one winner; the loser sees `false` and shows an
 * honest "just got busy" message rather than corrupting state. Returns
 * whether THIS call's transition actually applied.
 */
async function guardedTransition(
  tableId: number,
  fromStatus: TableStatus,
  toStatus: TableStatus,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .update({ status: toStatus })
    .eq('id', tableId)
    .eq('status', fromStatus)
    .select('id');
  if (error) throw error;
  return (data?.length || 0) > 0;
}

/** available -> awaiting_order: guest seated, no order yet. */
export function seatWalkIn(tableId: number): Promise<boolean> {
  return guardedTransition(tableId, 'available', 'awaiting_order');
}

/** awaiting_order -> cleaning: released before any order was registered
 *  (no order exists yet, so there's nothing for an RPC to cancel). */
export function freeAwaitingOrderTable(tableId: number): Promise<boolean> {
  return guardedTransition(tableId, 'awaiting_order', 'cleaning');
}

/** cleaning -> available: a human confirms the table was actually
 *  bussed. The system never makes this transition on its own. */
export function markTableCleaned(tableId: number): Promise<boolean> {
  return guardedTransition(tableId, 'cleaning', 'available');
}

/** serving/awaiting_payment -> awaiting_payment: cashier is closing out
 *  the bill. Guarded against the table's OWN current status, since it's
 *  legal to call this from either serving or awaiting_payment (resuming
 *  an already-started checkout). */
export async function resumePaymentForTable(
  tableId: number,
  currentStatus: 'serving' | 'awaiting_payment',
): Promise<boolean> {
  if (currentStatus === 'awaiting_payment') return true; // already there
  return guardedTransition(tableId, 'serving', 'awaiting_payment');
}

export async function moveTableOrder(orderId: number, newTableId: number): Promise<number> {
  const { data, error } = await supabase.rpc('move_table_order', {
    p_order_id: orderId,
    p_new_table_id: newTableId,
  });
  if (error) throw error;
  return data as number;
}

/**
 * Void an unpaid dine-in tab. The real PWA gates this behind a manager
 * PIN prompt (`openPinModal`) before calling the RPC — no such
 * manager-approval mechanism exists yet anywhere in this RN app (no
 * checkpoint has built one), so this is a real, disclosed parity gap:
 * cancellation is wired to the same RPC/idempotency the PWA uses, but
 * without the PIN gate. Not silently building new manager-auth
 * machinery beyond what this checkpoint asked for.
 */
export async function cancelDineInOrder(orderId: number, stillOccupied: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('cancel_dine_in_order', {
    p_order_id: orderId,
    p_still_occupied: stillOccupied,
  });
  if (error) throw error;
  return data as number;
}

export interface ActiveOrderSummary {
  id: number;
  total: number;
}

export async function getOrderSummary(orderId: number): Promise<ActiveOrderSummary | null> {
  const { data, error } = await supabase.from('orders').select('id, total').eq('id', orderId).single();
  if (error) return null;
  return data;
}

/**
 * Real-time table sync — mirrors the PWA's subscribeToTableChanges
 * (Supabase Realtime `postgres_changes` on `restaurant_tables`), so a
 * second device's seat/pay/cancel/move is reflected without polling.
 * Uses the same supabase-js client/API as the web app; the underlying
 * transport is a plain WebSocket, which React Native provides natively
 * (no native module needed) — but this has NOT been confirmed to
 * actually deliver events on a real device/simulator from this
 * environment (Windows can't run the RN runtime at all), so treat this
 * as 🟡 Ready for Testing, not verified.
 */
export function subscribeToTableChanges(branchId: number, onChange: () => void): () => void {
  const channel = supabase
    .channel(`restaurant_tables:branch:${branchId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'restaurant_tables', filter: `branch_id=eq.${branchId}` },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
