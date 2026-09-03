import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TouchableOpacity } from './tappable';
import LinearGradient from 'react-native-linear-gradient';
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
import { createStyles, fonts, gradients, Palette, radii, spacing, useTheme } from './theme';
import { useShell } from './shell';
import Money from './Money';

const STATUS_TABS: { value: OrderHistoryStatus; label: string }[] = [
  { value: 'completed', label: 'مكتملة' },
  { value: 'cancelled', label: 'ملغاة' },
  { value: 'refunded', label: 'مسترجعة' },
];

const CHANNEL_LABELS: Record<string, string> = { dine_in: 'بالمطعم', pickup: 'استلام', delivery: 'توصيل' };
const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: 'كاش', card: 'بطاقة', split: 'تقسيم دفع', delivery_platform: 'مدفوع عبر التطبيق' };

// .order-row-badge.<status> (rakeen-pos.css:456-458). This screen's own
// tabs are completed/cancelled/refunded, not the PWA's running/completed/
// cancelled set -- refunded has no direct badge rule in the source, so it
// reuses the closest semantic match (danger, same as cancelled) rather
// than inventing a new color.
const rowBadgeColor = (colors: Palette): Record<OrderHistoryStatus, string> => ({
  completed: colors.muted,
  cancelled: colors.danger,
  refunded: colors.danger,
});

/**
 * Feature Parity Pass -- Refunds/Void/Cancellation. Ported from the PWA's
 * real Orders screen "completed"/"cancelled" tabs + order-detail sheet +
 * refundOrderBtn (public/pos/rakeen-pos.js, ~3303-3589). Refund is
 * manager-PIN gated (ManagerPinModal, same as TablesScreen.tsx's void
 * flow) before ever calling refund_pos_order -- never a bare confirm().
 *
 * Visuals: .orders-list/.order-row/.order-row-badge/.order-row-total match
 * rakeen-pos.css value-for-value. The status tabs and detail-sheet action
 * buttons reuse the same channel-tab/pay-btn/danger-button language
 * already established elsewhere (no dedicated PWA class exists for either
 * — see ROW_BADGE_COLOR above for the one place that required a judgment
 * call).
 */
export default function OrderHistoryScreen({ branchId }: { branchId: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { sideBySide, insetTop, insetBottom } = useShell();
  // rakeen-pos.css:433/434 -- .screen-head clears the topbar
  // (--topbar-h + 20), .orders-list clears the bottom nav (16 + 68).
  const headInset = sideBySide ? { paddingTop: insetTop + 20 } : null;
  const listInset = sideBySide ? { paddingBottom: 16 + insetBottom } : null;
  const ROW_BADGE_COLOR = rowBadgeColor(colors);
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
      <View style={[styles.tabsRow, headInset]}>
        {STATUS_TABS.map(tab => {
          const active = status === tab.value;
          return (
            <TouchableOpacity
              key={tab.value}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setStatus(tab.value)}
              activeOpacity={0.8}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accentText} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => String(r.id)}
          contentContainerStyle={[styles.list, listInset]}
          ListEmptyComponent={<Text style={styles.empty}>لا يوجد طلبات.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openDetail(item.id)} activeOpacity={0.8}>
              <View style={[styles.rowBadge, { backgroundColor: ROW_BADGE_COLOR[status] }]} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>#{item.id} — {item.customerName || CHANNEL_LABELS[item.channel] || item.channel}</Text>
                <Text style={styles.rowMeta}>{new Date(item.createdAt).toLocaleString('ar-SA')}</Text>
              </View>
              <Money value={item.total} size={14.5} />
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={detail != null || detailLoading} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {detailLoading && !detail ? (
              <ActivityIndicator color={colors.accentText} />
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
                    <Money value={it.lineTotal} size={11.5} />
                  </View>
                ))}
                <View style={styles.divider} />
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>المجموع الفرعي</Text>
                  <Money value={detail.subtotal} size={11.5} />
                </View>
                {detail.discountAmount > 0 && (
                  <View style={styles.itemRow}>
                    <Text style={styles.itemName}>الخصم</Text>
                    <Money value={-detail.discountAmount} size={11.5} />
                  </View>
                )}
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>الضريبة</Text>
                  <Money value={detail.vatAmount} size={11.5} />
                </View>
                <View style={styles.itemRow}>
                  <Text style={styles.itemNameBold}>الإجمالي</Text>
                  <Money value={detail.total} size={13.5} />
                </View>
                <Text style={styles.sheetMeta}>الدفع: {PAYMENT_METHOD_LABELS[detail.paymentMethod] || detail.paymentMethod}</Text>

                <TouchableOpacity disabled={reprintBusy} onPress={handleReprint} activeOpacity={0.85}>
                  <LinearGradient colors={gradients.payButton.colors} start={gradients.payButton.start} end={gradients.payButton.end} style={styles.reprintButton}>
                    <Text style={styles.reprintButtonText}>{reprintBusy ? 'جارٍ الإضافة...' : 'إعادة طباعة'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
                {!!reprintStatus && <Text style={styles.statusText}>{reprintStatus}</Text>}

                {detail.status === 'completed' && (
                  <TouchableOpacity
                    style={styles.refundButton}
                    disabled={refundBusy}
                    onPress={() => setPinPendingRefund(true)}
                    activeOpacity={0.8}>
                    <Text style={styles.refundButtonText}>{refundBusy ? 'جارٍ الاسترجاع...' : 'استرجاع مبلغ'}</Text>
                  </TouchableOpacity>
                )}
                {!!refundStatus && <Text style={styles.statusText}>{refundStatus}</Text>}

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

const useStyles = createStyles(colors =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  // channel-row/channel-btn pattern reused for the status segmented control
  tabsRow: { flexDirection: 'row', gap: 4, margin: spacing[4], padding: 4, backgroundColor: colors.surf1, borderRadius: radii.full },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radii.full, alignItems: 'center' },
  tabActive: { backgroundColor: colors.lime },
  tabText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.muted },
  tabTextActive: { color: colors.flagGreenDeep },
  center: { marginTop: 40 },
  error: { fontFamily: fonts.sansBold, color: colors.danger, textAlign: 'center', marginTop: 20 },
  empty: { fontFamily: fonts.sansSemiBold, textAlign: 'center', color: colors.muted, marginTop: 20 },
  list: { paddingHorizontal: spacing[4], paddingBottom: spacing[4] },
  // .order-row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surf1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[2],
  },
  // .order-row-badge
  rowBadge: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  rowInfo: { flex: 1, minWidth: 0 },
  // .order-row-title
  rowTitle: { fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.text },
  // .order-row-meta
  rowMeta: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted, marginTop: 2 },
  // .order-row-total
  rowTotal: { fontFamily: fonts.monoBold, fontSize: 14.5, color: colors.text, writingDirection: 'ltr' },
  // .modal-overlay
  overlay: { flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.cardBg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing[5], maxHeight: '85%' },
  sheetTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, marginBottom: 6, textAlign: 'center' },
  sheetMeta: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted, marginBottom: 10, textAlign: 'center' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemName: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.text, flex: 1 },
  itemTotal: { fontFamily: fonts.monoMedium, fontSize: 13, color: colors.text, writingDirection: 'ltr' },
  itemNameBold: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text, flex: 1 },
  itemTotalBold: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.accentText, writingDirection: 'ltr' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing[2] },
  refundButton: {
    backgroundColor: `rgba(${colors.dangerRgb},0.12)`,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
    marginTop: spacing[4],
  },
  refundButtonText: { fontFamily: fonts.sansBold, color: colors.danger },
  reprintButton: { borderRadius: radii.md, padding: 14, alignItems: 'center', marginTop: spacing[4] },
  reprintButtonText: { fontFamily: fonts.sansBold, color: colors.flagGreenDeep },
  statusText: { fontFamily: fonts.sansSemiBold, textAlign: 'center', marginTop: 10, fontSize: 12, color: colors.muted },
  closeButton: { padding: 14, alignItems: 'center', marginTop: spacing[2] },
  closeButtonText: { fontFamily: fonts.sansBold, color: colors.muted },
  }),
);
