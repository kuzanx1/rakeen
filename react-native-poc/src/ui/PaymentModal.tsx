import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { TouchableOpacity } from './tappable';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import type { PaymentMethod } from '../domain/payment';
import { computeCashChange } from '../domain/payment';
import Money from './Money';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';

/**
 * renderPaymentStep() (rakeen-pos.js:1611). Shows the SAME total Cart
 * already computed -- financial values are never recalculated here, only
 * displayed and, for cash, compared against the amount tendered.
 *
 * Rebuilt against the live PWA rather than the previous cash/card pair.
 * What the runtime audit turned up, in the order the source emits it:
 *
 *  1. `.pm-tabs` comes FIRST, then `.due-display`. This modal had them
 *     the other way round.
 *  2. There are THREE base methods -- cash / card / تقسيم -- and a fourth,
 *     الولاء, appended only when a real saved customer with a positive
 *     points balance is attached (`state.customer && state.customer.id
 *     && state.customer.points > 0`). Split was missing entirely.
 *  3. `.friends-split` -- a collapsed ÷ قسّم بين الأصحاب calculator with
 *     counts 2-6, hidden on the loyalty method. Purely informational: the
 *     source's own comment stresses it "doesn't touch payment_method or
 *     any order data". Was missing entirely.
 *  4. The cash field starts EMPTY (`value="${state.cashAmount||''}"`), so
 *     تأكيد الدفع starts DISABLED. This modal pre-filled it with the
 *     total, which armed the confirm button before the cashier had
 *     counted anything.
 *  5. Switching method resets both cash and split amounts to 0.
 *  6. The card state is a 52px circle holding a 24px card glyph over
 *     "مرّر أو قرّب البطاقة على الجهاز" -- not a bare sentence.
 *
 * `.qa-btn` values stay plain strings, NOT <Money>: the source prints
 * `${v}` where v is already `n.toFixed(2)`, with no rkMoney() call.
 */
export default function PaymentModal({
  visible,
  total,
  onCancel,
  onConfirm,
  submitting,
  loyaltyAvailable = false,
}: {
  visible: boolean;
  total: number;
  onCancel: () => void;
  onConfirm: (method: PaymentMethod, cashAmount: number | null) => void;
  submitting: boolean;
  /** state.customer && state.customer.id && state.customer.points > 0 */
  loyaltyAvailable?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashInput, setCashInput] = useState('');
  const [splitCardInput, setSplitCardInput] = useState('');
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsCount, setFriendsCount] = useState<number | null>(null);

  /** `state.activePaymentMethod = ...; state.cashAmount=0;
   *  state.splitCardAmount=0` on every tab tap (rakeen-pos.js:1697). */
  const pickMethod = (m: PaymentMethod) => {
    setMethod(m);
    setCashInput('');
    setSplitCardInput('');
  };

  // Reopening for a new sale must not inherit the last one's tender.
  useEffect(() => {
    if (!visible) return;
    setMethod('cash');
    setCashInput('');
    setSplitCardInput('');
    setFriendsOpen(false);
    setFriendsCount(null);
  }, [visible]);

  /** renderPaymentStep()'s own expression, unchanged. */
  const quickAmounts = React.useMemo(
    () =>
      [
        ...new Set(
          [total, Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100].map(n =>
            n.toFixed(2),
          ),
        ),
      ].slice(0, 4),
    [total],
  );

  const cashAmount = parseFloat(cashInput) || 0;
  const change = computeCashChange(cashAmount, total);

  // `const cardAmt = Math.min(total, state.splitCardAmount || 0);
  //  const cashAmt = Math.max(0, Number((total - cardAmt).toFixed(2)));`
  const splitCard = Math.min(total, parseFloat(splitCardInput) || 0);
  const splitCash = Math.max(0, Number((total - splitCard).toFixed(2)));
  const validSplit = splitCard > 0 && splitCash > 0;

  const canConfirm =
    method === 'cash' ? cashAmount >= total : method === 'split' ? validSplit : true;

  const methods: { id: PaymentMethod; label: string }[] = [
    { id: 'cash', label: 'كاش' },
    { id: 'card', label: 'بطاقة' },
    { id: 'split', label: 'تقسيم' },
  ];
  if (loyaltyAvailable) methods.push({ id: 'loyalty', label: 'الولاء' });

  const tabIcon = (id: PaymentMethod, active: boolean) => {
    const stroke = active ? colors.accentText : colors.muted;
    if (id === 'cash') {
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2}>
          <Rect x={2} y={6} width={20} height={12} rx={2} />
          <Circle cx={12} cy={12} r={3} />
        </Svg>
      );
    }
    if (id === 'card') {
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2}>
          <Rect x={2} y={5} width={20} height={14} rx={2} />
          <Line x1={2} y1={10} x2={22} y2={10} />
        </Svg>
      );
    }
    if (id === 'split') {
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2}>
          <Line x1={12} y1={2} x2={12} y2={22} />
          <Path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </Svg>
      );
    }
    // The loyalty tab's "icon" is literally the 🎁 emoji in the source.
    return <Text style={{ fontSize: 18 }}>🎁</Text>;
  };

  const confirmLabel = method === 'split' ? 'تأكيد الدفع المقسّم' : 'تأكيد الدفع';

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

          <ScrollView keyboardShouldPersistTaps="handled">
            {/* .pm-tabs -- before .due-display, per the source's own order */}
            <View style={styles.methodTabs}>
              {methods.map(m => {
                const active = method === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.methodTab, active && styles.methodTabActive]}
                    onPress={() => pickMethod(m.id)}
                    activeOpacity={0.8}>
                    {tabIcon(m.id, active)}
                    <Text style={[styles.methodTabText, active && styles.methodTabTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* .due-display */}
            <View style={styles.dueDisplay}>
              <Text style={styles.dueLabel}>المبلغ المطلوب</Text>
              <Money value={total} size={30} style={styles.dueAmount} />
            </View>

            {/* .friends-split -- hidden on the loyalty method */}
            {method !== 'loyalty' && (
              <View style={styles.friendsSplit}>
                <TouchableOpacity onPress={() => setFriendsOpen(o => !o)} style={styles.friendsToggle} activeOpacity={0.7}>
                  <Text style={styles.friendsToggleText}>÷ قسّم بين الأصحاب</Text>
                </TouchableOpacity>
                {friendsOpen && (
                  <View style={styles.friendsBody}>
                    <View style={styles.friendsCounts}>
                      {[2, 3, 4, 5, 6].map(n => {
                        const active = friendsCount === n;
                        return (
                          <TouchableOpacity
                            key={n}
                            style={[styles.fscBtn, active && styles.fscBtnActive]}
                            onPress={() => setFriendsCount(n)}
                            activeOpacity={0.8}>
                            <Text style={[styles.fscBtnText, active && styles.fscBtnTextActive]}>{n}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {friendsCount != null && (
                      <View style={styles.friendsResult}>
                        <Text style={styles.friendsResultLabel}>كل واحد يدفع</Text>
                        <Money value={total / friendsCount} size={15} color={colors.accentText} />
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {method === 'cash' && (
              <>
                {/* .quick-amounts is `repeat(4,1fr)` -- a four-column GRID,
                    so with fewer than four options the buttons keep their
                    quarter width instead of stretching to fill the row. */}
                <View style={styles.quickAmounts}>
                  {quickAmounts.map(v => (
                    <TouchableOpacity key={v} style={styles.qaBtn} onPress={() => setCashInput(v)} activeOpacity={0.8}>
                      <Text style={styles.qaBtnText}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                  {/* Grid cells the option list didn't fill. */}
                  {Array.from({ length: 4 - quickAmounts.length }).map((_, i) => (
                    <View key={`sp${i}`} style={styles.qaSpacer} />
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  value={cashInput}
                  onChangeText={setCashInput}
                />
                <View style={styles.changeRow}>
                  <Text style={styles.changeLabel}>الباقي</Text>
                  <Money value={change} size={15} color={colors.accentText} />
                </View>
              </>
            )}

            {method === 'split' && (
              <View style={styles.splitInputs}>
                <Text style={styles.splitLabel}>المبلغ كاش</Text>
                {/* The cash side is always just total - card, so it is
                    derived and read-only rather than a second source of
                    truth. state.splitCardAmount is the only stored value. */}
                <View style={[styles.input, styles.inputDerived]}>
                  <Text style={styles.inputDerivedText}>{splitCash ? splitCash.toFixed(2) : '0.00'}</Text>
                </View>
                <Text style={styles.splitLabel}>المبلغ عبر الشبكة (بطاقة)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  value={splitCardInput}
                  onChangeText={setSplitCardInput}
                />
              </View>
            )}

            {(method === 'card' || method === 'loyalty') && (
              <View style={styles.cardTapState}>
                <View style={styles.cardTapIcon}>
                  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2}>
                    <Rect x={2} y={5} width={20} height={14} rx={2} />
                    <Line x1={2} y1={10} x2={22} y2={10} />
                  </Svg>
                </View>
                <Text style={styles.cardNote}>مرّر أو قرّب البطاقة على الجهاز</Text>
              </View>
            )}

            {canConfirm && !submitting ? (
              <TouchableOpacity
                onPress={() => onConfirm(method, method === 'cash' ? cashAmount : null)}
                activeOpacity={0.85}>
                <LinearGradient
                  colors={gradients.payButton.colors}
                  start={gradients.payButton.start}
                  end={gradients.payButton.end}
                  style={styles.confirmButton}>
                  <Text style={styles.confirmText}>{confirmLabel}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <View style={[styles.confirmButton, styles.confirmButtonDisabled]}>
                {submitting ? (
                  <ActivityIndicator color={colors.muted} />
                ) : (
                  <Text style={[styles.confirmText, styles.confirmTextDisabled]}>{confirmLabel}</Text>
                )}
              </View>
            )}
          </ScrollView>
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
  sheet: { backgroundColor: colors.cardBg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing[5], maxHeight: '90%' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[3] },
  // .modal-head h3
  title: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text },
  // .modal-close
  closeCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
  closeCircleText: { color: colors.muted, fontSize: 13 },
  // .due-display / .due-label / .due-amount
  dueDisplay: { alignItems: 'center', paddingVertical: 16, backgroundColor: colors.surf1, borderRadius: radii.lg, marginBottom: spacing[4] },
  dueLabel: { fontFamily: fonts.sansBold, fontSize: 10.5, color: colors.muted },
  dueAmount: { marginTop: 5 },
  // .pm-tabs / .pm-tab
  methodTabs: { flexDirection: 'row', gap: 8, marginBottom: spacing[4] },
  methodTab: { flex: 1, paddingVertical: 14, paddingHorizontal: 6, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf1, alignItems: 'center', gap: 6 },
  methodTabActive: { borderColor: colors.limeDeep, backgroundColor: `rgba(${colors.limeRgb},0.12)` },
  methodTabText: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted },
  // .pm-tab.active -- --lime-deep, overridden to --lime in dark
  methodTabTextActive: { color: colors.accentText },
  // .friends-split -- deliberately understated per the source's comment
  friendsSplit: { marginBottom: spacing[4] },
  friendsToggle: { paddingVertical: 4, paddingHorizontal: 2, alignSelf: 'flex-start' },
  friendsToggleText: { fontFamily: fonts.sansBold, fontSize: 11.5, color: colors.muted },
  // .friends-split-body
  friendsBody: { marginTop: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.surf1, borderWidth: 1, borderColor: colors.line },
  // .friends-split-counts
  friendsCounts: { flexDirection: 'row', gap: 6 },
  // .fsc-btn
  fscBtn: { flex: 1, paddingVertical: 9, borderRadius: radii.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf2, alignItems: 'center' },
  fscBtnActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  fscBtnText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
  fscBtnTextActive: { color: colors.flagGreenDeep },
  // .friends-split-result -- dashed top rule
  friendsResult: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, borderStyle: 'dashed' },
  friendsResultLabel: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
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
  qaSpacer: { flex: 1 },
  qaBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.text, writingDirection: 'ltr' },
  // .cash-input-row input / .split-inputs input
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
  inputDerived: { alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  inputDerivedText: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.text },
  // .split-inputs
  splitInputs: { marginBottom: spacing[4] },
  splitLabel: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, marginBottom: 6 },
  // .change-row -- `.mono` inside it is 15px --lime-deep, not body text
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, backgroundColor: `rgba(${colors.limeRgb},0.12)`, borderRadius: radii.md, marginBottom: spacing[4] },
  changeLabel: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.text },
  // .card-tap-state / .card-tap-icon
  cardTapState: { alignItems: 'center', paddingVertical: 26 },
  cardTapIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  cardNote: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.muted, textAlign: 'center' },
  // .confirm-pay-btn
  confirmButton: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  confirmButtonDisabled: { backgroundColor: colors.surf2 },
  confirmText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
  confirmTextDisabled: { color: colors.muted },
  }),
);
