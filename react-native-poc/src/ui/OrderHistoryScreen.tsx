import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, TextInput, View } from 'react-native';
import { profileToPrinterTarget, drawerKickCommandFor } from '../domain/printerProfile';
import { openCashDrawer } from '../platform/cashDrawer';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
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
import Svg, { Path, Polyline, Rect } from 'react-native-svg';
import Money from './Money';
import RunningOrdersList from './RunningOrdersList';
import { formatArabicDateTimeShort } from '../domain/arabicDate';

/**
 * "جارية" first, matching the source's own tab order and for the same
 * reason: it is the only tab with work waiting in it. The other three are
 * history.
 *
 * 'running' is not an orders.status -- an accepted order is already
 * `completed` -- so it is a view over "paid but not yet handed over"
 * rather than a status filter, and is rendered by its own component.
 */
type OrdersTab = 'running' | OrderHistoryStatus;

const STATUS_TABS: { value: OrdersTab; label: string }[] = [
  { value: 'running', label: 'جارية' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'cancelled', label: 'ملغاة' },
  // Not in the source's three, kept because a refund is a real outcome a
  // cashier needs to look up and it has nowhere else to be listed.
  { value: 'refunded', label: 'مسترجعة' },
];

const CHANNEL_LABELS: Record<string, string> = { dine_in: 'محلي', pickup: 'سفري', delivery: 'تطبيقات التوصيل' };
const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: 'كاش', card: 'بطاقة', split: 'تقسيم دفع', delivery_platform: 'مدفوع عبر التطبيق' };
/** ORDER_STATUS_LABELS_POS (rakeen-pos.js:3671). */
const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار القبول',
  completed: 'مكتمل',
  cancelled: 'ملغى',
  refunded: 'مسترجع',
  partially_refunded: 'مسترجع جزئياً',
  rejected: 'مرفوض',
};

// .order-row-badge.<status> (rakeen-pos.css:456-458). This screen's own
// tabs are completed/cancelled/refunded, not the PWA's running/completed/
// cancelled set -- refunded has no direct badge rule in the source, so it
// reuses the closest semantic match (danger, same as cancelled) rather
// than inventing a new color.
const rowBadgeColor = (colors: Palette): Record<OrderHistoryStatus, string> => ({
  completed: colors.muted,
  cancelled: colors.danger,
  refunded: colors.danger,
  partially_refunded: colors.danger,
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
/** .receipt-detail-row -- the one row shape the whole sheet is built
 *  from: a muted label on one side, its value on the other. */
function DetailRow({
  label,
  text,
  mono,
  last,
}: {
  label: string;
  text: string;
  mono?: boolean;
  /** Drops the rule under the final row, so the box closes on its border
   *  rather than on a line that looks like a missing row. */
  last?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.itemRow, styles.detailMetaRow, last && styles.detailMetaRowLast]}>
      <Text style={styles.itemName}>{label}</Text>
      <Text style={mono ? styles.detailValueMono : styles.detailValue} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

export default function OrderHistoryScreen({
  branchId,
  shiftId,
}: {
  branchId: number;
  /** Passed through to the running list: a collected cash payment has to
   *  land in the shift that is open right now. */
  shiftId: number | null;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { sideBySide, insetTop, insetBottom } = useShell();
  // rakeen-pos.css:433/434 -- .screen-head clears the topbar
  // (--topbar-h + 20), .orders-list clears the bottom nav (16 + 68).
  const headInset = sideBySide ? { paddingTop: insetTop + 20 } : null;
  const listInset = sideBySide ? { paddingBottom: 16 + insetBottom } : null;
  const ROW_BADGE_COLOR = rowBadgeColor(colors);
  const [status, setStatus] = useState<OrdersTab>('running');
  const [rows, setRows] = useState<OrderHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<OrderHistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refundBusy, setRefundBusy] = useState(false);
  const [pendingRefundAmount, setPendingRefundAmount] = useState<number | undefined>(undefined);
  const [refundStatus, setRefundStatus] = useState('');
  const [pinPendingRefund, setPinPendingRefund] = useState(false);
  const [refundAskOpen, setRefundAskOpen] = useState(false);
  const [refundAmountText, setRefundAmountText] = useState('');
  const [refundAskError, setRefundAskError] = useState('');
  const [reprintBusy, setReprintBusy] = useState(false);
  const [reprintStatus, setReprintStatus] = useState('');

  const refresh = useCallback(async () => {
    // 'running' has its own component and its own query -- it is a view
    // over undelivered orders, not a status to filter history by.
    if (status === 'running') return;
    setLoading(true);
    setError('');
    try {
      const result = await listOrderHistory(branchId, status);
      setRows(result);
    } catch (e) {
      setError('تعذر تحميل الطلبات — جرّب مرة ثانية');
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
      setReprintStatus('🔴 تعذرت الطباعة — جرّب مرة ثانية');
    } finally {
      setReprintBusy(false);
    }
  };

  /**
   * استرجاع مبلغ، أو الباقي كله حين لا يُمرَّر مبلغ.
   *
   * والاسترجاع كاش دائماً فالدرج يُفتح -- ولا يُنتظر ولا يُبطل شيئاً:
   * درجٌ لم ينفتح لا يجوز أن يُلغي استرجاعاً وقع في القاعدة فعلاً.
   */
  const performRefund = async (amount?: number) => {
    if (!detail) return;
    setRefundBusy(true);
    try {
      const res = await refundPosOrder(detail.id, amount);
      setRefundStatus(
        res.full
          ? '✅ تم استرجاع مبلغ الطلب كامل'
          : `✅ تم استرجاع ${res.refunded.toFixed(2)} ريال — باقي ${res.remaining.toFixed(2)}`,
      );
      setDetail({
        ...detail,
        status: res.full ? 'refunded' : 'partially_refunded',
        refundedAmount: res.refunded_total,
      });
      void kickDrawerAfterRefund();
      refresh();
    } catch (e) {
      setRefundStatus('🔴 تعذر الاسترجاع — جرّب مرة ثانية');
    } finally {
      setRefundBusy(false);
    }
  };

  const kickDrawerAfterRefund = async () => {
    try {
      const profile = await getPrinterProfile();
      const target = profileToPrinterTarget(profile);
      if (!target) return;
      await openCashDrawer({
        target,
        kickCommandBase64: drawerKickCommandFor(profile),
        timeoutMs: 8000,
        operationId: `refund-${detail?.id}-${Date.now()}`,
      });
    } catch {
      // الدرج ليس شرطاً لصحة الاسترجاع.
    }
  };

  /**
   * يسأل عن المبلغ قبل أن يسترجع.
   *
   * السقف هو الباقي من الفاتورة لا إجماليها، فلا يُسترجع مرتين فوق
   * استرجاع سابق. والقاعدة تفحصه ثانيةً -- هذا يمنع الغلطة، وذاك يمنع
   * التحايل.
   */
  const askRefundAmount = () => {
    if (!detail) return;
    const remaining = Math.max(0, detail.total - (detail.refundedAmount || 0));
    if (remaining <= 0.001) {
      setRefundStatus('هذا الطلب مسترجع بالكامل');
      return;
    }
    setRefundAmountText('');
    setRefundAskError('');
    setRefundAskOpen(true);
  };

  /**
   * يفحص المبلغ ثم يسلّمه لموافقة المدير.
   *
   * والخطأ يُعرض في اللوحة نفسها لا خلفها: الكاشير لا يقرأ ما تحت طبقة
   * تغطيه.
   */
  const submitRefundAmount = () => {
    if (!detail) return;
    const remaining = Math.max(0, detail.total - (detail.refundedAmount || 0));
    const text = refundAmountText.trim();
    if (text === '') {
      setRefundAskOpen(false);
      setPinPendingRefund(true);
      return;
    }
    const amount = Number(text.replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) {
      setRefundAskError('اكتب مبلغ صحيح');
      return;
    }
    if (amount > remaining + 0.001) {
      setRefundAskError('المبلغ أكبر من الباقي في الفاتورة');
      return;
    }
    setPendingRefundAmount(amount);
    setRefundAskOpen(false);
    setPinPendingRefund(true);
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

      {status === 'running' ? (
        <RunningOrdersList branchId={branchId} shiftId={shiftId} />
      ) : loading ? (
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
              <View style={[styles.rowBadge, { backgroundColor: ROW_BADGE_COLOR[status as OrderHistoryStatus] }]} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>#{item.id} — {item.customerName || CHANNEL_LABELS[item.channel] || item.channel}</Text>
                <Text style={styles.rowMeta}>{formatArabicDateTimeShort(new Date(item.createdAt))}</Text>
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
                {/* openOrderDetail() (rakeen-pos.js:3574) opens with the
                    channel and customer as a heading and the amount as a
                    big .receipt-total, then a single column of
                    .receipt-detail-row -- items and money and metadata all
                    in the same row shape. This sheet used to mix three
                    different shapes and put the payment method in a
                    trailing side-line. */}
                {/* The source puts this in the popup's own head bar
                    ("تفاصيل الطلب #123"); this sheet has no head bar, so it
                    leads with it -- without it the cashier cannot tell
                    which order they opened. */}
                <Text style={styles.sheetOrderNo}>تفاصيل الطلب #{detail.id}</Text>
                <Text style={styles.sheetTitle}>
                  {CHANNEL_LABELS[detail.channel] || detail.channel}
                  {detail.customerName ? ` — ${detail.customerName}` : ''}
                </Text>
                <Money value={detail.total} size={26} style={styles.sheetTotal} />

                {detail.tableNumber != null && (
                  <DetailRow label="الطاولة" text={`طاولة ${detail.tableNumber}`} />
                )}

                {detail.items.map((it, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {it.qty} × {it.name}
                      {it.mods.length > 0 ? ` (${it.mods.join('، ')})` : ''}
                      {it.note ? ` — ${it.note}` : ''}
                    </Text>
                    <Money value={it.lineTotal} size={11.5} />
                  </View>
                ))}

                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>المجموع الفرعي</Text>
                  <Money value={detail.subtotal} size={11.5} />
                </View>
                {detail.deliveryFee > 0 && (
                  <View style={styles.itemRow}>
                    <Text style={styles.itemName}>رسوم التوصيل</Text>
                    <Money value={detail.deliveryFee} size={11.5} />
                  </View>
                )}
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

                {/* The order's facts, in their own ruled box. Loose under
                    the totals they merged into one block of grey text with
                    no edge between a line and the next. */}
                <View style={styles.detailMeta}>
                  <DetailRow
                    label="طريقة الدفع"
                    text={PAYMENT_METHOD_LABELS[detail.paymentMethod] || detail.paymentMethod}
                  />
                  {/* Both of these are rows in the source and were missing
                      from this sheet entirely. */}
                  <DetailRow
                    label="الحالة"
                    text={ORDER_STATUS_LABELS[detail.status] || String(detail.status)}
                    last={!detail.customerPhone && !detail.deliveryAddress}
                  />
                  {!!detail.customerPhone && (
                    <DetailRow
                      label="جوال العميل"
                      text={detail.customerPhone}
                      mono
                      last={!detail.deliveryAddress && detail.pagerNumber == null}
                    />
                  )}
                  {/* Which buzzer went out with it. Kept on the finished
                      order because "who had 20 last night?" is a question
                      that gets asked after the fact, when a customer comes
                      back about a missing item. */}
                  {detail.pagerNumber != null && (
                    <DetailRow
                      label="جهاز النداء"
                      text={String(detail.pagerNumber)}
                      mono
                      last={!detail.deliveryAddress}
                    />
                  )}
                  {!!detail.deliveryAddress && (
                    <DetailRow label="عنوان التوصيل" text={detail.deliveryAddress} last />
                  )}
                </View>

                {/* .receipt-actions -- a ROW of equal buttons, not a
                    stack. استرجاع مبلغ only exists on a completed order. */}
                <View style={styles.detailActions}>
                  <TouchableOpacity
                    style={styles.detailActionBtn}
                    disabled={reprintBusy}
                    onPress={handleReprint}
                    activeOpacity={0.8}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                      <Polyline points="6 9 6 2 18 2 18 9" />
                      <Path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <Rect x={6} y={14} width={12} height={8} />
                    </Svg>
                    <Text style={styles.detailActionText}>
                      {reprintBusy ? 'جارٍ الطباعة...' : 'إعادة طباعة'}
                    </Text>
                  </TouchableOpacity>
                  {(detail.status === 'completed' || detail.status === 'partially_refunded') && (
                    <TouchableOpacity
                      style={styles.detailActionBtn}
                      disabled={refundBusy}
                      onPress={askRefundAmount}
                      activeOpacity={0.8}>
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2}>
                        <Polyline points="9 14 4 9 9 4" />
                        <Path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                      </Svg>
                      <Text style={styles.detailActionText}>
                        {refundBusy ? 'جارٍ الاسترجاع...' : 'استرجاع مبلغ'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!!reprintStatus && <Text style={styles.statusText}>{reprintStatus}</Text>}
                {!!refundStatus && <Text style={styles.statusText}>{refundStatus}</Text>}

                <TouchableOpacity style={styles.closeButton} onPress={() => setDetail(null)}>
                  <Text style={styles.closeButtonText}>إغلاق</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          {/* طبقتا الاسترجاع داخل هذه النافذة، لا نافذتين فوقها.
              كانت لوحة المبلغ تنبيهَ نظام (Alert.prompt) وموافقةُ المدير
              <Modal> أخرى. وكل <Modal> على iOS هي UIViewController
              تُقدَّم فعلاً، فكان يُقدَّم مقدَّمٌ فوق مقدَّم -- ومن داخل
              رد نداء التنبيه، أي قبل أن يُتمّ التنبيه اختفاءه. فلا تظهر
              الثانية، ويبقى الحاجب الذي يبتلع اللمس: تطبيق معلّق عند كل
              استرجاع.

              وشاشة الطاولات لم تقع فيه لأنها تغلق المفتوح قبل أن تفتح
              التالي في كل انتقال. وهنا لا يصح إغلاق التفاصيل -- الكاشير
              يقرأ الفاتورة وهو يسترجع -- فصارت طبقات في نافذة واحدة.

              وAlert.prompt خاص بـiOS وحدها: على أندرويد لا يفعل شيئاً،
              فكان زر الاسترجاع هناك زراً لا يستجيب أصلاً. */}
          {refundAskOpen && detail && (
            <View style={styles.innerOverlay}>
              <View style={styles.askCard}>
                <Text style={styles.askTitle}>استرجاع مبلغ</Text>
                <Text style={styles.askNote}>
                  الباقي من الفاتورة {Math.max(0, detail.total - (detail.refundedAmount || 0)).toFixed(2)} ريال
                </Text>
                <Text style={styles.askNote}>اتركه فاضي لاسترجاع المبلغ كامل</Text>
                <TextInput
                  style={styles.askInput}
                  value={refundAmountText}
                  onChangeText={t => { setRefundAmountText(t); setRefundAskError(''); }}
                  keyboardType="decimal-pad"
                  placeholder="المبلغ كامل"
                  placeholderTextColor={colors.muted}
                  autoFocus
                  textAlign="center"
                />
                {!!refundAskError && <Text style={styles.askError}>{refundAskError}</Text>}
                <TouchableOpacity style={styles.askPrimary} onPress={submitRefundAmount} activeOpacity={0.85}>
                  <Text style={styles.askPrimaryText}>استرجاع</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.askCancel} onPress={() => setRefundAskOpen(false)}>
                  <Text style={styles.askCancelText}>إلغاء</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ManagerPinModal
            presentation="inline"
            visible={pinPendingRefund}
            onApprove={() => {
              setPinPendingRefund(false);
              // المبلغ يُلتقط قبل كلمة سر المدير ويُمرَّر بعدها، ويُمسح دائماً
              // -- وإلا ورث استرجاعٌ تالٍ مبلغ سابقه بلا أن يُسأل.
              const amount = pendingRefundAmount;
              setPendingRefundAmount(undefined);
              performRefund(amount);
            }}
            onCancel={() => { setPinPendingRefund(false); setPendingRefundAmount(undefined); }}
          />
        </View>
      </Modal>
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
  // طبقة داخل النافذة المفتوحة -- لا <Modal> ثانية تُقدَّم فوق الأولى.
  innerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.modalOverlay, justifyContent: 'center', alignItems: 'center', padding: spacing[5] },
  askCard: { backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.line, borderRadius: radii.xl, padding: spacing[6], width: '100%', maxWidth: 380 },
  askTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, textAlign: 'center', marginBottom: spacing[2] },
  askNote: { fontFamily: fonts.sansRegular, fontSize: 12.5, lineHeight: 19, color: colors.muted, textAlign: 'center' },
  askInput: {
    fontFamily: fonts.sansBold, fontSize: 20, color: colors.text,
    backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line,
    borderRadius: radii.md, paddingVertical: 12, paddingHorizontal: spacing[4],
    marginTop: spacing[4],
  },
  askError: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 12, textAlign: 'center', marginTop: spacing[2] },
  askPrimary: { backgroundColor: colors.lime, borderRadius: radii.full, paddingVertical: 14, alignItems: 'center', marginTop: spacing[4] },
  askPrimaryText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
  askCancel: { padding: spacing[3], alignItems: 'center', marginTop: 4 },
  askCancelText: { fontFamily: fonts.sansBold, color: colors.muted },
  sheet: { backgroundColor: colors.cardBg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing[5], maxHeight: '85%' },
  sheetTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.text, marginBottom: 6, textAlign: 'center' },
  // space-between does the placing; the label must NOT also stretch.
  // With flex:1 on the label plus a physical textAlign, the text ended up
  // pinned against the value with nothing between them, which is why the
  // sheet read as "طريقة الدفعكاش" and "الحالةمكتمل" — one run of letters.
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing[4],
    paddingVertical: 5,
  },
  // Explicitly start-aligned, and this is not decoration. index.js sets
  // I18nManager.swapLeftAndRightInRTL(false) on purpose (so ported
  // physical `left`/`right` values keep meaning literal sides, as they do
  // in rakeen-pos.css) -- but that also stops a Text's default
  // `textAlign:'auto'` from following the RTL layout direction, so Arabic
  // inside any STRETCHED box lands on the left. In a row where the label
  // fills the free space and the amount is pinned at the other end, that
  // reads as the price colliding with the end of the name.
  itemName: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.text, flexShrink: 1 },
  sheetOrderNo: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text, textAlign: 'center', marginBottom: 6 },
  // .receipt-total -- the amount as the sheet's headline figure
  sheetTotal: { alignSelf: 'center', marginBottom: 16 },
  // The order's facts, boxed and ruled. Loose rows under the item list ran
  // together into one grey block with no way to see where a line ended.
  detailMeta: {
    marginTop: spacing[3],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    paddingHorizontal: spacing[3],
    paddingVertical: 2,
  },
  detailMetaRow: { borderBottomWidth: 1, borderBottomColor: colors.line },
  detailMetaRowLast: { borderBottomWidth: 0 },
  detailValue: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text, flexShrink: 1, textAlign: 'left' },
  detailValueMono: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.text, writingDirection: 'ltr', textAlign: 'left' },
  // .receipt-actions / .receipt-action-btn
  detailActions: { flexDirection: 'row', gap: 8, marginTop: spacing[4], marginBottom: 10 },
  detailActionBtn: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    alignItems: 'center',
    gap: 5,
  },
  detailActionText: { fontFamily: fonts.sansBold, fontSize: 10.5, color: colors.text },
  statusText: { fontFamily: fonts.sansSemiBold, textAlign: 'center', marginTop: 10, fontSize: 12, color: colors.muted },
  closeButton: { padding: 14, alignItems: 'center', marginTop: spacing[2] },
  closeButtonText: { fontFamily: fonts.sansBold, color: colors.muted },
  }),
);
