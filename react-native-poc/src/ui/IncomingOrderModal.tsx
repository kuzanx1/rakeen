import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import Money from './Money';
import { REJECT_REASONS } from '../application/incomingOrderService';
import type { IncomingOrder } from '../application/incomingOrderService';
import { createStyles, fonts, gradients, radii, useTheme } from './theme';

const CHANNEL_LABELS: Record<string, string> = { dine_in: 'بالمطعم', pickup: 'استلام', delivery: 'توصيل' };
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
      value: new Date(order.scheduledFor).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      loud: true,
    };
  })();

  return (
    <Modal visible={order != null || loading} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={[styles.card, shadows.md]}>
          <View style={styles.head}>
            <Text style={styles.title}>طلب إلكتروني جديد 🌐</Text>
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
                <Text style={styles.channelLine}>
                  {CHANNEL_LABELS[order.channel] || order.channel}
                  {order.customerName ? ` — ${order.customerName}` : ''}
                </Text>

                {!!order.customerPhone && (
                  // A tappable dial link, as in the source -- the cashier
                  // may need to call about a delivery address.
                  <TouchableOpacity
                    style={styles.callRow}
                    onPress={() => Linking.openURL(`tel:${order.customerPhone!.replace(/\D/g, '')}`)}
                    activeOpacity={0.7}>
                    <Text style={styles.callText}>📞 {order.customerPhone}</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.row}>
                  <Text style={styles.rowLabel}>طريقة الدفع</Text>
                  <Text style={styles.rowValue}>
                    {PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}
                    {order.paymentMethod === 'cash' ? ' — يُدفع عند الاستلام' : ''}
                  </Text>
                </View>

                {pickupNote && (
                  <View style={[styles.row, pickupNote.loud && styles.rowLoud]}>
                    <Text style={[styles.rowLabel, pickupNote.loud && styles.rowLabelLoud]}>{pickupNote.label}</Text>
                    <Text style={[styles.rowValue, pickupNote.loud && styles.rowValueLoud]}>{pickupNote.value}</Text>
                  </View>
                )}

                {!!order.deliveryAddress && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>عنوان التوصيل</Text>
                    <Text style={styles.rowValueWrap}>{order.deliveryAddress}</Text>
                  </View>
                )}

                {order.items.map((it, i) => (
                  <View key={i} style={styles.row}>
                    <Text style={styles.itemName}>
                      {it.qty} × {it.name}
                      {it.mods.length > 0 ? ` (${it.mods.join('، ')})` : ''}
                      {it.note ? ` — ${it.note}` : ''}
                    </Text>
                    <Money value={it.lineTotal} size={11.5} />
                  </View>
                ))}

                <Money value={order.total} size={26} style={styles.total} />

                {!!error && <Text style={styles.error}>{error}</Text>}

                <View style={styles.actions}>
                  {busy ? (
                    <View style={[styles.primaryWrap, styles.primaryBtn, styles.primaryDisabled]}>
                      <ActivityIndicator color={colors.muted} />
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejecting(true)} activeOpacity={0.8}>
                        <Text style={styles.rejectBtnText}>رفض ❌</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.primaryWrap} onPress={onAccept} activeOpacity={0.85}>
                        <View style={styles.primaryBtn}>
                          <GradientFill gradient={gradients.payButton} radius={radii.md} />
                          <Text style={styles.primaryBtnText}>قبول ✅</Text>
                        </View>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
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
    head: { paddingTop: 20, paddingHorizontal: 22 },
    title: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text, textAlign: 'center' },
    body: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 22 },
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
    primaryBtn: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
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
