import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TouchableOpacity } from './tappable';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import type { PaymentMethod } from '../domain/payment';
import { computeCashChange } from '../domain/payment';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';

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
  const { colors } = useTheme();
  const styles = useStyles();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashInput, setCashInput] = useState(total.toFixed(2));

  /** renderPaymentStep()'s own expression, unchanged. */
  const quickAmounts = React.useMemo(
    () =>
      [...new Set([total, Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100].map(n => n.toFixed(2)))].slice(0, 4),
    [total],
  );

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
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={method === 'cash' ? colors.accentText : colors.muted} strokeWidth={2}>
                <Rect x={2} y={6} width={20} height={12} rx={2} />
                <Circle cx={12} cy={12} r={3} />
              </Svg>
              <Text style={[styles.methodTabText, method === 'cash' && styles.methodTabTextActive]}>كاش</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodTab, method === 'card' && styles.methodTabActive]}
              onPress={() => setMethod('card')}
              activeOpacity={0.8}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={method === 'card' ? colors.accentText : colors.muted} strokeWidth={2}>
                <Rect x={2} y={5} width={20} height={14} rx={2} />
                <Line x1={2} y1={10} x2={22} y2={10} />
              </Svg>
              <Text style={[styles.methodTabText, method === 'card' && styles.methodTabTextActive]}>بطاقة</Text>
            </TouchableOpacity>
          </View>

          {method === 'cash' && (
            <>
              {/* .quick-amounts / .qa-btn -- the source's own option set:
                  the exact total, then rounded up to the next 10, 50 and
                  100, de-duplicated on the FORMATTED string (so a total
                  that is already a round number collapses instead of
                  repeating) and capped at four. */}
              <View style={styles.quickAmounts}>
                {quickAmounts.map(v => (
                  <TouchableOpacity key={v} style={styles.qaBtn} onPress={() => setCashInput(v)} activeOpacity={0.8}>
                    <Text style={styles.qaBtnText}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
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

const useStyles = createStyles(colors =>
  StyleSheet.create({
  // .modal-overlay
  overlay: { flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'flex-end' },
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
  methodTab: { flex: 1, paddingVertical: 14, paddingHorizontal: 6, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1, alignItems: 'center', gap: 6 },
  methodTabActive: { borderColor: colors.limeDeep, backgroundColor: `rgba(${colors.limeRgb},0.12)` },
  methodTabText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted },
  // .pm-tab.active -- --lime-deep, overridden to --lime in dark
  methodTabTextActive: { color: colors.accentText },
  // .quick-amounts -- `repeat(4,1fr); gap:7px; margin-bottom:12px`
  quickAmounts: { flexDirection: 'row', gap: 7, marginBottom: spacing[3] },
  // .qa-btn
  qaBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surf1,
    alignItems: 'center',
  },
  qaBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.text, writingDirection: 'ltr' },
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
  }),
);
