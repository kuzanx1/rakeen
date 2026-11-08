import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import Money from './Money';
import KeyboardLift from './KeyboardLift';
import { REJECT_REASONS } from '../application/incomingOrderService';
import type { IncomingOrder } from '../application/incomingOrderService';
import { createStyles, fonts, gradients, radii, useTheme } from './theme';
import { formatPickupAt } from '../domain/arabicDate';
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'كاش',
  card: 'بطاقة',
  split: 'تقسيم دفع',
  delivery_platform: 'مدفوع عبر التطبيق',
};

/**
 * #incomingOrderModal -- a new online order landing on the till
 * (renderIncomingOrderModal, rakeen-pos.js:6496).
 *
 * Deliberately has NO close button and NO backdrop dismiss, unlike every
 * other modal in the app. The source is explicit that "the only valid way
 * out is an explicit Accept or Reject" -- a customer is waiting on the
 * answer, so it must not be possible to swipe the decision away.
 */
export default function IncomingOrderModal({
  order,
  loading,
  busy,
  error,
  onAccept,
  onReject,
}: {
  order: IncomingOrder | null;
  loading: boolean;
  busy: boolean;
  error: string;
  onAccept: () => void;
  onReject: (reason: string) => void;
}) {
  const { colors, shadows } = useTheme();
  const styles = useStyles();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');

  useEffect(() => {
    // A fresh order always opens on the accept view, never mid-rejection
    // of the previous one.
    setRejecting(false);
    setReason(null);
    setOtherText('');
  }, [order?.id]);

  const isOther = reason === '__other__';
  const finalReason = isOther ? otherText.trim() : reason;
  const canConfirmReject = !!finalReason;

  const pickupNote = (() => {
    if (!order || order.channel !== 'pickup' || !order.scheduledFor) return null;
    // ASAP is just this order's own estimate, not a commitment. A time the
    // customer actually PICKED gets said loudly so the cashier does not
    // treat it like a now-order.
    if (!order.scheduledByCustomer) return { label: 'وقت الاستلام', value: 'الآن', loud: false };
    return {
      label: 'وقت الاستلام',
      value: formatPickupAt(order.scheduledFor),
      loud: true,
    };
  })();

  return (
    <Modal visible={order != null || loading} animationType="fade" transparent>
      <KeyboardLift style={styles.overlay}>
        <View style={[styles.card, shadows.md]}>
          {/* ترويسةٌ ملوّنة: الطلب الإلكتروني يُعرف من أول نظرة، ورقمه فيها */}
          <View style={styles.head}>
            <GradientFill gradient={gradients.productIcon} radius={0} />
            <Text style={styles.headKicker}>طلب إلكتروني جديد</Text>
            {order && <Text style={styles.headNumber}>#{order.id}</Text>}
            {order && (
              <View style={styles.headPill}>
                <Text style={styles.headPillText}>
                  {order.channel === 'delivery' ? 'توصيل' : 'استلام من المطعم'}
                </Text>
              </View>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {loading || !order ? (
              <ActivityIndicator color={colors.accentText} style={styles.loading} />
            ) : rejecting ? (
              <>
                <Text style={styles.sub}>اختر سبب الرفض</Text>
                <View style={styles.reasonChips}>
                  {[...REJECT_REASONS, '__other__'].map(r => {
                    const active = reason === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[styles.reasonChip, active && styles.reasonChipActive]}
                        onPress={() => setReason(r)}
                        activeOpacity={0.8}>
                        <Text style={[styles.reasonChipText, active && styles.reasonChipTextActive]}>
                          {r === '__other__' ? 'سبب آخر' : r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {isOther && (
                  <TextInput
                    style={styles.otherInput}
                    placeholder="اكتب السبب..."
                    placeholderTextColor={colors.muted}
                    value={otherText}
                    onChangeText={setOtherText}
                    autoFocus
                  />
                )}
                {!!error && <Text style={styles.error}>{error}</Text>}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => setRejecting(false)} disabled={busy}>
                    <Text style={styles.secondaryBtnText}>رجوع</Text>
                  </TouchableOpacity>
                  {canConfirmReject && !busy ? (
                    <TouchableOpacity style={styles.primaryWrap} onPress={() => onReject(finalReason!)} activeOpacity={0.85}>
                      <View style={styles.primaryBtn}>
                        <GradientFill gradient={gradients.payButton} radius={radii.md} />
                        <Text style={styles.primaryBtnText}>تأكيد الرفض</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.primaryWrap, styles.primaryBtn, styles.primaryDisabled]}>
                      {busy ? (
                        <ActivityIndicator color={colors.muted} />
                      ) : (
                        <Text style={[styles.primaryBtnText, styles.primaryTextDisabled]}>تأكيد الرفض</Text>
                      )}
                    </View>
                  )}
                </View>
              </>
            ) : (
              <>
                {/* الوقت اللي حدده الزبون أول شي، وبأكبر خط: الطلب هذا مو للحين */}
                {pickupNote?.loud ? (
                  <View style={styles.schedHero}>
                    <Text style={styles.schedHeroLabel}>العميل حدد وقت الاستلام — مطلوب تجهيزه الساعة</Text>
                    <Text style={styles.schedHeroTime}>{pickupNote.value}</Text>
                    <Text style={styles.schedHeroHint}>يبقى معلّق في «الطلبات» لين قبل وقته بنص ساعة</Text>
                  </View>
                ) : order.channel === 'pickup' ? (
                  <View style={styles.asapPill}>
                    <Text style={styles.asapPillText}>بأسرع وقت</Text>
                  </View>
                ) : null}

                {/* العميل: اسمه، وجواله زر اتصال */}
                <View style={styles.customer}>
                  <View style={styles.customerInfo}>
                    <Text style={styles.customerLabel}>العميل</Text>
                    <Text style={styles.customerName}>{order.customerName || '—'}</Text>
                  </View>
                  {!!order.customerPhone && (
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => Linking.openURL(`tel:${order.customerPhone!.replace(/\D/g, '')}`)}
                      activeOpacity={0.75}>
                      <Text style={styles.callBtnLabel}>اتصل</Text>
                      <Text style={styles.callBtnNum}>{order.customerPhone}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {!!order.deliveryAddress && (
                  <View style={styles.infoBox}>
                    <Text style={styles.infoLabel}>عنوان التوصيل</Text>
                    <Text style={styles.infoText}>{order.deliveryAddress}</Text>
                  </View>
                )}

                <View style={styles.items}>
                  {order.items.map((it, i) => (
                    <View key={i} style={[styles.item, i > 0 && styles.itemBorder]}>
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyText}>{it.qty}</Text>
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{it.name}</Text>
                        {it.mods.length > 0 && <Text style={styles.itemMods}>{it.mods.join('، ')}</Text>}
                        {!!it.note && <Text style={styles.itemNote}>ملاحظة: {it.note}</Text>}
                      </View>
                      <Money value={it.lineTotal} size={12.5} />
                    </View>
                  ))}
                </View>

                {!!order.customerNote && (
                  <View style={styles.infoBox}>
                    <Text style={styles.infoLabel}>ملاحظة العميل</Text>
                    <Text style={styles.infoText}>{order.customerNote}</Text>
                  </View>
                )}

                <View style={styles.totalRow}>
                  <View>
                    <Text style={styles.totalLabel}>الإجمالي</Text>
                    <Text style={styles.payText}>
                      {PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}
                      {order.paymentMethod === 'cash' ? ' — يُدفع عند الاستلام' : ''}
                    </Text>
                  </View>
                  <Money value={order.total} size={26} />
                </View>

                {!!error && <Text style={styles.error}>{error}</Text>}

                <View style={styles.actions}>
                  {busy ? (
                    <View style={[styles.primaryWrap, styles.primaryBtn, styles.primaryDisabled]}>
                      <ActivityIndicator color={colors.muted} />
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejecting(true)} activeOpacity={0.8}>
                        <Text style={styles.rejectBtnText}>رفض</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.acceptWrap} onPress={onAccept} activeOpacity={0.85}>
                        <View style={styles.primaryBtn}>
                          <GradientFill gradient={gradients.payButton} radius={radii.md} />
                          <Text style={styles.primaryBtnText}>قبول الطلب</Text>
                        </View>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardLift>
    </Modal>
  );
}

const useStyles = createStyles(colors =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(6,16,10,0.78)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    card: {
      width: 420,
      maxWidth: '92%',
      maxHeight: '88%',
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.xl,
      overflow: 'hidden',
    },
    head: { paddingTop: 18, paddingBottom: 16, paddingHorizontal: 22, alignItems: 'center', gap: 4, overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: colors.line },
    headKicker: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.muted, letterSpacing: 0.3 },
    headNumber: { fontFamily: fonts.monoBold, fontSize: 30, color: colors.text },
    headPill: { marginTop: 4, paddingVertical: 4, paddingHorizontal: 12, borderRadius: radii.full, backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.line },
    headPillText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.text },
    body: { paddingTop: 16, paddingHorizontal: 20, paddingBottom: 20, gap: 12 },

    schedHero: {
      alignItems: 'center',
      gap: 2,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: radii.lg,
      borderWidth: 2,
      borderColor: colors.limeDeep,
      backgroundColor: `rgba(${colors.limeRgb},0.14)`,
    },
    schedHeroLabel: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text, textAlign: 'center' },
    schedHeroTime: { fontFamily: fonts.sansBold, fontSize: 34, color: colors.text },
    schedHeroHint: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted, textAlign: 'center' },
    asapPill: { alignSelf: 'center', paddingVertical: 5, paddingHorizontal: 14, borderRadius: radii.full, backgroundColor: colors.surf2 },
    asapPillText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },

    customer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.lg, backgroundColor: colors.surf1 },
    customerInfo: { flex: 1, minWidth: 0 },
    customerLabel: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted },
    customerName: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text, marginTop: 2 },
    callBtn: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, borderRadius: radii.md, backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.line },
    callBtnLabel: { fontFamily: fonts.sansBold, fontSize: 10.5, color: colors.accentText },
    callBtnNum: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.text },

    infoBox: { padding: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, gap: 3 },
    infoLabel: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted },
    infoText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },

    items: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12 },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11 },
    itemBorder: { borderTopWidth: 1, borderTopColor: colors.line },
    qtyBadge: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: `rgba(${colors.limeRgb},0.22)` },
    qtyText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.text },
    itemInfo: { flex: 1, minWidth: 0, gap: 2 },
    itemMods: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted },
    itemNote: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.text },

    totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
    totalLabel: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
    payText: { fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.muted, marginTop: 2 },
    acceptWrap: { flex: 2 },
    loading: { marginVertical: 40 },
    sub: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.muted, textAlign: 'center', marginBottom: 14 },
    channelLine: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text, marginBottom: 8 },
    callRow: { paddingVertical: 10, alignItems: 'center', backgroundColor: colors.surf1, borderRadius: radii.md, marginBottom: 10 },
    callText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.accentText },

    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    // A customer-chosen pickup time gets a lime wash so it cannot be
    // mistaken for a now-order.
    rowLoud: { backgroundColor: `rgba(${colors.limeRgb},0.12)`, borderRadius: radii.md, paddingHorizontal: 12, borderBottomWidth: 0, marginVertical: 4 },
    rowLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted },
    rowLabelLoud: { color: colors.text, fontFamily: fonts.sansBold },
    rowValue: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
    rowValueLoud: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.accentText },
    rowValueWrap: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.text, flex: 1, textAlign: 'left' },
    itemName: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.text, flex: 1 },
    total: { alignSelf: 'center', marginTop: 14 },

    reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    reasonChip: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
    },
    reasonChipActive: { backgroundColor: colors.lime, borderColor: colors.lime },
    reasonChipText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
    reasonChipTextActive: { color: colors.flagGreenDeep },
    otherInput: {
      width: '100%',
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      color: colors.text,
      fontFamily: fonts.sansSemiBold,
      fontSize: 13,
      textAlign: 'right',
      marginBottom: 12,
    },

    error: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.danger, textAlign: 'center', marginTop: 10 },

    actions: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'stretch' },
    primaryWrap: { flex: 1 },
    primaryBtn: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.lime },
    primaryDisabled: { backgroundColor: colors.surf2 },
    primaryBtnText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
    primaryTextDisabled: { color: colors.muted },
    // .clear-btn.armed -- the reject action carries the danger wash
    rejectBtn: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(224,138,106,0.15)',
    },
    rejectBtnText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.danger },
    secondaryBtn: { flex: 1, paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
    secondaryBtnText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted },
  }),
);
