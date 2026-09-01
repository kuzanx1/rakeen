import { supabase } from '../infrastructure/supabaseClient';
import { sqliteOrderQueueStorage } from '../infrastructure/sqliteOrderQueue';
import { QueuedPayload, OrderPayload, DineInRegisterPayload, DineInPayPayload } from '../domain/order';
import { syncQueuedOrders, SyncOutcome } from '../domain/orderQueue';

/**
 * Real RPC dispatch -- exact same three RPCs, exact same parameter names,
 * as public/pos/rakeen-pos.js's sendOrderToServer/sendDineInRegisterToServer/
 * sendDineInPayToServer. No backend changes; this calls the actual,
 * already-deployed complete_pos_order/register_dine_in_order/
 * pay_dine_in_order RPCs.
 */

async function sendOrderToServer(payload: OrderPayload): Promise<unknown> {
  const { data, error } = await supabase.rpc('complete_pos_order', {
    p_client_order_uuid: payload.client_order_uuid,
    p_branch_id: payload.branch_id,
    p_shift_id: payload.shift_id,
    p_customer_name: payload.customer_name,
    p_customer_phone: payload.customer_phone,
    p_subtotal: payload.subtotal,
    p_discount_pct: payload.discount_pct,
    p_discount_amount: payload.discount_amount,
    p_vat_amount: payload.vat_amount,
    p_total: payload.total,
    p_payment_method: payload.payment_method,
    p_cash_amount: payload.cash_amount,
    p_items: payload.items,
    p_channel: payload.channel,
    p_delivery_platform_id: payload.delivery_platform_id,
    p_table_id: payload.table_id,
    p_staff_member_id: payload.staff_member_id,
    p_platform_invoice_last4: payload.platform_invoice_last4,
    p_customer_id: payload.customer_id,
  });
  if (error) throw error;
  return data;
}

async function sendDineInRegisterToServer(payload: DineInRegisterPayload): Promise<unknown> {
  const { data, error } = await supabase.rpc('register_dine_in_order', {
    p_client_order_uuid: payload.client_order_uuid,
    p_branch_id: payload.branch_id,
    p_shift_id: payload.shift_id,
    p_customer_name: payload.customer_name,
    p_customer_phone: payload.customer_phone,
    p_subtotal: payload.subtotal,
    p_discount_pct: payload.discount_pct,
    p_items: payload.items,
    p_table_id: payload.table_id,
    p_staff_member_id: payload.staff_member_id,
    p_existing_order_id: payload.existing_order_id,
    p_customer_id: payload.customer_id,
  });
  if (error) throw error;
  return data;
}

/**
 * pay_dine_in_order has no idempotency key of its own -- it doesn't need
 * one. Its own WHERE clause (payment_status = 'unpaid') already makes a
 * second call against an order this exact call already paid a clean
 * no-op at the DB level; it surfaces as the "already paid" exception
 * instead of silently succeeding twice. A retry treats that specific
 * message as success (already applied), not a real failure -- anything
 * else still fails normally and stays queued. Exact same tolerance as
 * public/pos/rakeen-pos.js's real sendDineInPayToServer.
 */
export async function sendDineInPayToServer(payload: DineInPayPayload): Promise<unknown> {
  const { error } = await supabase.rpc('pay_dine_in_order', {
    p_order_id: payload.order_id,
    p_payment_method: payload.payment_method,
    p_cash_amount: payload.cash_amount,
    p_customer_name: payload.customer_name,
    p_customer_phone: payload.customer_phone,
    p_customer_id: payload.customer_id,
  });
  if (error && !/already paid/i.test(error.message || '')) throw error;
  return payload.order_id;
}

export function dispatchQueuedPayload(payload: QueuedPayload): Promise<unknown> {
  if (payload.type === 'dine_in_register') {
    return sendDineInRegisterToServer(payload);
  }
  if (payload.type === 'dine_in_pay') {
    return sendDineInPayToServer(payload);
  }
  return sendOrderToServer(payload as OrderPayload);
}

/**
 * Queue-first submission -- persists to SQLite BEFORE attempting any
 * network call, exactly matching requirement 6's mandated order
 * (Cart -> generate client_order_uuid -> persist locally FIRST -> attempt
 * server submission -> success marks synced / failure keeps it queued).
 * Never throws on a network failure -- the caller always gets back
 * whether the immediate attempt succeeded, but the order is safe in the
 * queue either way.
 */
export async function submitOrder(payload: QueuedPayload): Promise<{ immediate: boolean; orderId?: number; error?: string }> {
  await sqliteOrderQueueStorage.put(payload);
  try {
    const result = await dispatchQueuedPayload(payload);
    await sqliteOrderQueueStorage.remove(payload.client_order_uuid);
    return { immediate: true, orderId: typeof result === 'number' ? result : undefined };
  } catch (e) {
    return { immediate: false, error: e instanceof Error ? e.message : String(e) };
  }
}

let syncing = false;

/** Real wiring of domain/orderQueue.ts's storage/dispatch-agnostic
 *  algorithm to the actual SQLite storage and actual RPC calls -- the
 *  same function verified against a fake storage in the checkpoint's
 *  test script is what runs here, unmodified. */
export async function syncQueuedOrdersNow(): Promise<SyncOutcome | null> {
  if (syncing) return null;
  syncing = true;
  try {
    return await syncQueuedOrders(sqliteOrderQueueStorage, dispatchQueuedPayload, Date.now());
  } finally {
    syncing = false;
  }
}
