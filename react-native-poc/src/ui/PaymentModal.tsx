import React, { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import type { PaymentMethod } from '../domain/payment';
import { computeCashChange } from '../domain/payment';
import { colors, fonts, gradients, radii, spacing } from './theme';

/**
 * Checkpoint 6 (Payment) -- cash and card only this checkpoint (split/
 * loyalty deferred, see domain/payment.ts's own doc comment). Shows the
 * SAME total Cart already computed (domain/cart.ts's cartTotals) --
 * financial values are never recalculated here, only displayed and, for
 * cash, compared against the amount tendered.
 *
 * Visuals: .modal-card/.pm-tabs/.pm-tab/.due-display/.cash-input-row/
 * .change-row/.confirm-pay-btn match rakeen-pos.css value-for-value. The
 * PWA closes this modal via a corner X (.modal-close), not a text
 * "إلغاء" button in a 50/50 row -- matched here with a plain close link
 * instead of the old two-button Material row.
 */
export default function PaymentModal({
  visible,
  total,
  onCancel,
  onConfirm,
  submitting,
}: {
  visible: boolean;
  total: number;
  onCancel: () => void;
  onConfirm: (method: PaymentMethod, cashAmount: number | null) => void;
  submitting: boolean;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashInput, setCashInput] = useState(total.toFixed(2));

  const cashAmount = parseFloat(cashInput) || 0;
  const change = computeCashChange(cashAmount, total);
  const canConfirm = method === 'card' || cashAmount >= total;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>الدفع</Text>
            <TouchableOpacity onPress={onCancel} disabled={submitting} style={styles.closeCircle}>
              <Text style={styles.closeCircleText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dueDisplay}>
            <Text style={styles.dueLabel}>المبلغ المطلوب</Text>
            <Text style={styles.dueAmount}>{total.toFixed(2)} ر.س</Text>
          </View>

          <View style={styles.methodTabs}>
            <TouchableOpacity
              style={[styles.methodTab, method === 'cash' && styles.methodTabActive]}
              onPress={() => setMethod('cash')}
              activeOpacity={0.8}>
              <Text style={[styles.methodTabText, method === 'cash' && styles.methodTabTextActive]}>كاش</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodTab, method === 'card' && styles.methodTabActive]}
              onPress={() => setMethod('card')}
              activeOpacity={0.8}>
              <Text style={[styles.methodTabText, method === 'card' && styles.methodTabTextActive]}>بطاقة</Text>
            </TouchableOpacity>
          </View>

          {method === 'cash' && (
            <>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={cashInput}
                onChangeText={setCashInput}
              />
              <View style={styles.changeRow}>
                <Text style={styles.changeLabel}>الباقي</Text>
                <Text style={styles.changeValue}>{change.toFixed(2)} ر.س</Text>
              </View>
            </>
          )}

          {method === 'card' && (
            <View style={styles.cardTapState}>
              <Text style={styles.cardNote}>تأكيد بعد إتمام العملية على جهاز الدفع الخارجي</Text>
            </View>
          )}

          {canConfirm && !submitting ? (
            <TouchableOpacity onPress={() => onConfirm(method, method === 'cash' ? cashAmount : null)} activeOpacity={0.85}>
              <LinearGradient colors={gradients.payButton.colors} start={gradients.payButton.start} end={gradients.payButton.end} style={styles.confirmButton}>
                <Text style={styles.confirmText}>تأكيد الدفع</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={[styles.confirmButton, styles.confirmButtonDisabled]}>
              {submitting ? <ActivityIndicator color={colors.muted} /> : <Text style={[styles.confirmText, styles.confirmTextDisabled]}>تأكيد الدفع</Text>}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // .modal-overlay
  overlay: { flex: 1, backgroundColor: 'rgba(6,16,10,0.78)', justifyContent: 'flex-end' },
  // .modal-card
  sheet: { backgroundColor: colors.cardBg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing[5] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] },
  // .modal-head h3
  title: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text },
  // .modal-close
  closeCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
  closeCircleText: { color: colors.muted, fontSize: 13 },
  // .due-display / .due-label / .due-amount
  dueDisplay: { alignItems: 'center', paddingVertical: 16, backgroundColor: colors.surf1, borderRadius: radii.lg, marginBottom: spacing[4] },
  dueLabel: { fontFamily: fonts.sansBold, fontSize: 10.5, color: colors.muted },
  dueAmount: { fontFamily: fonts.monoBold, fontSize: 30, color: colors.text, marginTop: 5, writingDirection: 'ltr' },
  // .pm-tabs / .pm-tab
  methodTabs: { flexDirection: 'row', gap: 8, marginBottom: spacing[4] },
  methodTab: { flex: 1, paddingVertical: 14, paddingHorizontal: 6, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1, alignItems: 'center' },
  methodTabActive: { borderColor: colors.limeDeep, backgroundColor: `rgba(${colors.limeRgb},0.12)` },
  methodTabText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted },
  methodTabTextActive: { color: colors.lime },
  // .cash-input-row input
  input: {
    width: '100%',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    color: colors.text,
    fontFamily: fonts.monoBold,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: spacing[3],
  },
  // .change-row
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, backgroundColor: `rgba(${colors.limeRgb},0.12)`, borderRadius: radii.md, marginBottom: spacing[4] },
  changeLabel: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted },
  changeValue: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.text, writingDirection: 'ltr' },
  // .card-tap-state
  cardTapState: { alignItems: 'center', paddingVertical: 26 },
  cardNote: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted, textAlign: 'center' },
  // .confirm-pay-btn
  confirmButton: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  confirmButtonDisabled: { backgroundColor: colors.surf2 },
  confirmText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
  confirmTextDisabled: { color: colors.muted },
});
