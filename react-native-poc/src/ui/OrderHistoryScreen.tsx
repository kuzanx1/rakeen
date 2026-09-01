import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  listOrderHistory,
  getOrderHistoryDetail,
  refundPosOrder,
  OrderHistoryRow,
  OrderHistoryDetail,
  OrderHistoryStatus,
} from '../application/orderHistoryService';
import ManagerPinModal from './ManagerPinModal';
import { enqueuePrintJob } from '../application/printService';
import { getDeviceConfig } from '../application/authService';
import { getReceiptBusinessProfile } from '../application/catalogService';
import { getPrinterProfile } from '../infrastructure/printerProfileStore';
import { shouldPrintCustomerReceipt, shouldPrintReceiptLogo } from '../domain/printerProfile';
import type { ReceiptData } from '../domain/receipt';

const STATUS_TABS: { value: OrderHistoryStatus; label: string }[] = [
  { value: 'completed', label: 'مكتملة' },
  { value: 'cancelled', label: 'ملغاة' },
  { value: 'refunded', label: 'مسترجعة' },
];

const CHANNEL_LABELS: Record<string, string> = { dine_in: 'بالمطعم', pickup: 'استلام', delivery: 'توصيل' };
const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: 'كاش', card: 'بطاقة', split: 'تقسيم دفع', delivery_platform: 'مدفوع عبر التطبيق' };

/**
 * Feature Parity Pass -- Refunds/Void/Cancellation. Ported from the PWA's
 * real Orders screen "completed"/"cancelled" tabs + order-detail sheet +
 * refundOrderBtn (public/pos/rakeen-pos.js, ~3303-3589). Refund is
 * manager-PIN gated (ManagerPinModal, same as TablesScreen.tsx's void
 * flow) before ever calling refund_pos_order -- never a bare confirm().
 */
export default function OrderHistoryScreen({ branchId }: { branchId: number }) {
  const [status, setStatus] = useState<OrderHistoryStatus>('completed');
  const [rows, setRows] = useState<OrderHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<OrderHistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundStatus, setRefundStatus] = useState('');
  const [pinPendingRefund, setPinPendingRefund] = useState(false);
  const [reprintBusy, setReprintBusy] = useState(false);
  const [reprintStatus, setReprintStatus] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listOrderHistory(branchId, status);
      setRows(result);
    } catch (e) {
      setError(`تعذر تحميل الطلبات: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [branchId, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openDetail = async (orderId: number) => {
    setDetailLoading(true);
    setRefundStatus('');
    setReprintStatus('');
    try {
      const d = await getOrderHistoryDetail(orderId);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  };

  /** Feature Parity Pass -- Refunds/Void/Cancellation audit. Ported from
   *  the PWA's real reprintBtn (rakeen-pos.js's order-detail sheet,
   *  ~3549-3561, buildHistoricalReceiptData) -- a real, existing PWA
   *  capability that wasn't ported when this screen was first built.
   *  Reuses the same real order data already fetched for the detail view
   *  (real names/mods/totals/VAT, not a placeholder). */
  const handleReprint = async () => {
    if (!detail) return;
    setReprintBusy(true);
    setReprintStatus('');
    try {
      const device = await getDeviceConfig();
      const profile = device.businessId != null ? await getReceiptBusinessProfile(device.businessId) : null;
      const printerProfile = await getPrinterProfile();
      if (!shouldPrintCustomerReceipt(printerProfile)) {
        setReprintStatus('⚪ طباعة إيصال العميل معطّلة من الإعدادات');
        return;
      }
      await enqueuePrintJob('receipt', {
        orderId: detail.id,
        lines: detail.items.map(it => ({
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
          mods: it.mods,
          note: it.note || undefined,
        })),
        subtotal: detail.subtotal,
        discount: detail.discountAmount,
        vat: detail.vatAmount,
        total: detail.total,
        paymentMethod: detail.paymentMethod,
        change: 0,
        businessName: device.businessName ?? undefined,
        branchName: device.branchName ?? undefined,
        vatNumber: profile?.vatNumber || undefined,
        logoUrl: shouldPrintReceiptLogo(printerProfile) ? profile?.logoUrl || undefined : undefined,
        customMessage: profile?.customMessage || undefined,
        createdAtISO: detail.createdAt,
        metaLabel: (CHANNEL_LABELS[detail.channel] || detail.channel) + (detail.tableNumber != null ? ` — طاولة ${detail.tableNumber}` : ''),
      } satisfies ReceiptData);
      setReprintStatus('🟢 أُضيفت الطباعة إلى قائمة الانتظار');
    } catch (e) {
      setReprintStatus(`🔴 تعذرت الطباعة: ${String(e)}`);
    } finally {
      setReprintBusy(false);
    }
  };

  const performRefund = async () => {
    if (!detail) return;
    setRefundBusy(true);
    try {
      await refundPosOrder(detail.id);
      setRefundStatus('✅ تم استرجاع مبلغ الطلب');
      setDetail({ ...detail, status: 'refunded' });
      refresh();
    } catch (e) {
      setRefundStatus(`🔴 تعذر الاسترجاع: ${String(e)}`);
    } finally {
      setRefundBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.tabsRow}>
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.tab, status === tab.value && styles.tabActive]}
            onPress={() => setStatus(tab.value)}>
            <Text style={[styles.tabText, status === tab.value && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => String(r.id)}
          ListEmptyComponent={<Text style={styles.empty}>لا يوجد طلبات.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openDetail(item.id)}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>#{item.id} — {item.customerName || CHANNEL_LABELS[item.channel] || item.channel}</Text>
                <Text style={styles.rowMeta}>{new Date(item.createdAt).toLocaleString('ar-SA')}</Text>
              </View>
              <Text style={styles.rowTotal}>{item.total.toFixed(2)} ر.س</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={detail != null || detailLoading} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {detailLoading && !detail ? (
              <ActivityIndicator />
            ) : detail ? (
              <>
                <Text style={styles.sheetTitle}>طلب #{detail.id}</Text>
                <Text style={styles.sheetMeta}>
                  {CHANNEL_LABELS[detail.channel] || detail.channel}
                  {detail.tableNumber != null ? ` — طاولة ${detail.tableNumber}` : ''}
                  {' — '}
                  {new Date(detail.createdAt).toLocaleString('ar-SA')}
                </Text>
                {detail.items.map((it, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {it.qty} × {it.name}
                      {it.mods.length > 0 ? ` (${it.mods.join('، ')})` : ''}
                    </Text>
                    <Text style={styles.itemTotal}>{it.lineTotal.toFixed(2)}</Text>
                  </View>
                ))}
                <View style={styles.divider} />
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>المجموع الفرعي</Text>
                  <Text style={styles.itemTotal}>{detail.subtotal.toFixed(2)}</Text>
                </View>
                {detail.discountAmount > 0 && (
                  <View style={styles.itemRow}>
                    <Text style={styles.itemName}>الخصم</Text>
                    <Text style={styles.itemTotal}>-{detail.discountAmount.toFixed(2)}</Text>
                  </View>
                )}
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>الضريبة</Text>
                  <Text style={styles.itemTotal}>{detail.vatAmount.toFixed(2)}</Text>
                </View>
                <View style={styles.itemRow}>
                  <Text style={styles.itemNameBold}>الإجمالي</Text>
                  <Text style={styles.itemTotalBold}>{detail.total.toFixed(2)}</Text>
                </View>
                <Text style={styles.sheetMeta}>الدفع: {PAYMENT_METHOD_LABELS[detail.paymentMethod] || detail.paymentMethod}</Text>

                <TouchableOpacity style={styles.reprintButton} disabled={reprintBusy} onPress={handleReprint}>
                  <Text style={styles.reprintButtonText}>{reprintBusy ? 'جارٍ الإضافة...' : 'إعادة طباعة'}</Text>
                </TouchableOpacity>
                {!!reprintStatus && <Text style={styles.refundStatus}>{reprintStatus}</Text>}

                {detail.status === 'completed' && (
                  <TouchableOpacity
                    style={styles.refundButton}
                    disabled={refundBusy}
                    onPress={() => setPinPendingRefund(true)}>
                    <Text style={styles.refundButtonText}>{refundBusy ? 'جارٍ الاسترجاع...' : 'استرجاع مبلغ'}</Text>
                  </TouchableOpacity>
                )}
                {!!refundStatus && <Text style={styles.refundStatus}>{refundStatus}</Text>}

                <TouchableOpacity style={styles.closeButton} onPress={() => setDetail(null)}>
                  <Text style={styles.closeButtonText}>إغلاق</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <ManagerPinModal
        visible={pinPendingRefund}
        onApprove={() => {
          setPinPendingRefund(false);
          performRefund();
        }}
        onCancel={() => setPinPendingRefund(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f5f0' },
  tabsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0' },
  tabActive: { backgroundColor: '#3f51b5', borderColor: '#3f51b5' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#333' },
  tabTextActive: { color: '#fff' },
  center: { marginTop: 40 },
  error: { color: '#c0392b', textAlign: 'center', marginTop: 20 },
  empty: { textAlign: 'center', color: '#666', marginTop: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  rowInfo: { flex: 1 },
  rowTitle: { fontWeight: '700', fontSize: 13, color: '#333' },
  rowMeta: { fontSize: 11, color: '#666', marginTop: 2 },
  rowTotal: { fontWeight: '800', fontSize: 14, color: '#333' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '85%' },
  sheetTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  sheetMeta: { fontSize: 12, color: '#666', marginBottom: 10, textAlign: 'center' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemName: { fontSize: 13, color: '#333', flex: 1 },
  itemTotal: { fontSize: 13, color: '#333' },
  itemNameBold: { fontSize: 15, fontWeight: '800', color: '#333', flex: 1 },
  itemTotalBold: { fontSize: 15, fontWeight: '800', color: '#333' },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginVertical: 8 },
  refundButton: { backgroundColor: '#c0392b', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 14 },
  refundButtonText: { color: '#fff', fontWeight: '700' },
  reprintButton: { backgroundColor: '#3f51b5', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 14 },
  reprintButtonText: { color: '#fff', fontWeight: '700' },
  refundStatus: { textAlign: 'center', marginTop: 10, fontSize: 12 },
  closeButton: { padding: 14, alignItems: 'center', marginTop: 8 },
  closeButtonText: { color: '#666', fontWeight: '700' },
});
