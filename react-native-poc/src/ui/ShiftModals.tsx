import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import Money from './Money';
import ManagerPinModal from './ManagerPinModal';
import { loadShiftTotals, closeShift } from '../application/shiftService';
import { EMPTY_SHIFT_TOTALS, varianceLabel, varianceSeverity } from '../domain/shift';
import type { ClosingReport, Shift, ShiftTotals } from '../domain/shift';
import { createStyles, fonts, gradients, radii, spacing, useTheme } from './theme';
import { formatArabicTime, formatArabicDateTime } from '../domain/arabicDate';

/**
 * openShiftSummary() (rakeen-pos.js:5421) and the closing wizard (:5467),
 * both of which live in the same popup shell as the payment steps.
 */

function useShiftTotals(shift: Shift | null, visible: boolean) {
  const [totals, setTotals] = useState<ShiftTotals>(EMPTY_SHIFT_TOTALS);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const t = await loadShiftTotals(shift);
      if (cancelled) return;
      setTotals(t);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [shift, visible]);
  return { totals, loading };
}

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors, shadows } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.overlay}>
      <View style={[styles.card, shadows.md]}>
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.headCircle}>
            <Text style={[styles.closeGlyph, { color: colors.text }]}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );
}

/** .shift-stat-row -- the same label/figure row the settings sheet uses. */
function StatRow({ label, value, total }: { label: string; value: number; total?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.statRow, total && styles.statRowTotal]}>
      <Text style={[styles.statLabel, total && styles.statLabelTotal]}>{label}</Text>
      <Money value={value} size={total ? 15 : 12} color={total ? colors.accentText : colors.text} />
    </View>
  );
}

export function ShiftSummaryModal({
  visible,
  shift,
  onClose,
}: {
  visible: boolean;
  shift: Shift | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { totals, loading } = useShiftTotals(shift, visible);

  const startTime = shift
    ? formatArabicTime(new Date(shift.opened_at))
    : '--:--';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Shell title="ملخص الوردية" onClose={onClose}>
        {loading ? (
          <ActivityIndicator color={colors.accentText} style={styles.loading} />
        ) : (
          <>
            <Text style={styles.sinceLine}>من بداية الوردية — {startTime}</Text>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>عدد الطلبات</Text>
              <Text style={styles.statCount}>{totals.ordersCount}</Text>
            </View>
            <StatRow label="إجمالي المبيعات" value={totals.salesTotal} />
            {/* Broken out so the expected figure can be READ rather than
                just trusted: a cashier who paid a supplier from the till
                can see exactly where it went. */}
            {totals.cashInTotal > 0 && <StatRow label="إيداع بالدرج" value={totals.cashInTotal} />}
            {totals.cashOutTotal > 0 && <StatRow label="سحب من الدرج" value={-totals.cashOutTotal} />}
            <StatRow label="كاش (شامل الرصيد الافتتاحي)" value={totals.cashTotal} />
            <StatRow label="بطاقة / Apple Pay" value={totals.cardTotal} />
            <StatRow label="توصيل — مدفوع عبر التطبيق" value={totals.deliveryPlatformTotal} total />
          </>
        )}
      </Shell>
    </Modal>
  );
}

/**
 * The closing wizard. Two steps: count the drawer, then reconcile.
 *
 * Confirming is gated behind the manager PIN. The source's own note on
 * why: closing "used to be a cashier-only action with no approval at all,
 * and the counted-vs-expected mismatch was shown but never enforced or
 * recorded anywhere." So the gate and the filed report are the point of
 * the screen, not decoration on it.
 */
export function CloseShiftModal({
  visible,
  shift,
  businessName,
  branchName,
  staffName,
  onClose,
  requireManagerPin = true,
  onClosed,
}: {
  visible: boolean;
  shift: Shift | null;
  businessName: string;
  branchName: string;
  staffName: string;
  onClose: () => void;
  /** businesses.pos_require_manager_pin_for_close. When the owner turns
   *  it off, closing goes straight through without the PIN. */
  requireManagerPin?: boolean;
  /** Fires only after the shift is genuinely closed, with the filed
   *  report so the caller can print it. `warning` carries a partial
   *  success -- closed, but something alongside it did not land. */
  onClosed: (report: ClosingReport, warning?: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { totals, loading } = useShiftTotals(shift, visible);
  const [step, setStep] = useState<1 | 2>(1);
  const [counted, setCounted] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setCounted('');
    setPinOpen(false);
    setBusy(false);
    setError('');
  }, [visible]);

  const countedNum = parseFloat(counted) || 0;
  const variance = countedNum - totals.cashTotal;
  const severity = varianceSeverity(variance);

  const performClose = async () => {
    if (!shift) return;
    setPinOpen(false);
    setBusy(true);
    setError('');
    const report: ClosingReport = {
      businessName: businessName || 'ركين',
      branchName,
      dateLabel: formatArabicDateTime(new Date()),
      staffName: staffName || 'بدون اسم',
      ordersCount: totals.ordersCount,
      salesTotal: totals.salesTotal,
      cardTotal: totals.cardTotal,
      deliveryPlatformTotal: totals.deliveryPlatformTotal,
      cashIn: totals.cashInTotal,
      cashOut: totals.cashOutTotal,
      cashExpected: totals.cashTotal,
      cashCounted: countedNum,
      cashVariance: variance,
    };
    const result = await closeShift({ shift, countedCash: countedNum, report });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'تعذر إغلاق الوردية.');
      return;
    }
    // ok with a message means the shift closed but its report did not
    // file -- worth saying out loud, not worth blocking on.
    onClosed(report, result.error ?? undefined);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Shell title={step === 1 ? 'إغلاق الوردية — عدّ الكاش' : 'إغلاق الوردية — المطابقة'} onClose={onClose}>
        {loading ? (
          <ActivityIndicator color={colors.accentText} style={styles.loading} />
        ) : step === 1 ? (
          <>
            {/*
              A BLIND count: the expected figure is deliberately not shown
              until the next step.

              Counting exists to DETECT a discrepancy, and showing the
              expected amount first destroys that. An honest cashier who
              counts 1,180 against a displayed 1,250 assumes they
              miscounted and types 1,250 to avoid trouble -- so a real
              shortfall disappears and nobody learns that, say, wrong
              change is being given every day. Someone dishonest simply
              types the number they were shown. Either way the count stops
              being a measurement and becomes agreement with a figure the
              system already had.

              Entered blind, the number is independent evidence: repeated
              small shortfalls point at a training problem, repeated
              surpluses at a pricing one. It also protects the cashier --
              a documented independent count is their defence, whereas
              "agreed with our number" is not.

              Step 2 is unchanged and still shows expected, counted and
              the variance together. The figure is delayed by one step,
              not hidden.
            */}
            <View style={styles.dueDisplay}>
              <Text style={styles.dueLabel}>عدّ الكاش الموجود بالدرج</Text>
              <Text style={styles.blindHint}>اكتب المبلغ اللي عدّيته — الفرق يظهر بالخطوة الجاية</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              value={counted}
              onChangeText={setCounted}
              autoFocus
            />
            {counted ? (
              <TouchableOpacity onPress={() => setStep(2)} activeOpacity={0.85}>
                <View style={styles.submit}>
                  <GradientFill gradient={gradients.payButton} radius={radii.md} />
                  <Text style={styles.submitText}>التالي</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={[styles.submit, styles.submitDisabled]}>
                <Text style={[styles.submitText, styles.submitTextDisabled]}>التالي</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <StatRow label="المتوقع" value={totals.cashTotal} />
            <StatRow label="المعدود فعليًا" value={countedNum} />
            <View style={[styles.statRow, styles.statRowTotal]}>
              <Text style={styles.statLabelTotal}>الفرق</Text>
              <View style={[styles.varianceBadge, styles[`variance_${severity}`]]}>
                <Text style={[styles.varianceText, styles[`varianceText_${severity}`]]}>
                  {varianceLabel(variance)}
                </Text>
              </View>
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}

            {busy ? (
              <View style={[styles.submit, styles.submitDisabled, styles.submitSpaced]}>
                <ActivityIndicator color={colors.muted} />
              </View>
            ) : (
              <TouchableOpacity onPress={() => setPinOpen(true)} activeOpacity={0.85} style={styles.submitSpaced}>
                <View style={styles.submit}>
                  <GradientFill gradient={gradients.payButton} radius={radii.md} />
                  <Text style={styles.submitText}>تأكيد إغلاق الوردية</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}
      </Shell>

      <ManagerPinModal visible={pinOpen} onApprove={performClose} onCancel={() => setPinOpen(false)} />
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
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingHorizontal: 22 },
    title: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text, flex: 1 },
    headCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
    closeGlyph: { fontSize: 13 },
    body: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 22 },
    loading: { marginVertical: 30 },
    sinceLine: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, textAlign: 'center', marginBottom: 16 },

    // .shift-stat-row
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    statRowTotal: { borderBottomWidth: 0, paddingTop: 12 },
    statLabel: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted },
    statLabelTotal: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
    statCount: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.text },

    // .due-display
    dueDisplay: { alignItems: 'center', paddingVertical: 16, backgroundColor: colors.surf1, borderRadius: radii.lg, marginBottom: spacing[3] },
    dueLabel: { fontFamily: fonts.sansBold, fontSize: 10.5, color: colors.muted },
    dueAmount: { marginTop: 5 },
    blindHint: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.muted, marginTop: 6, textAlign: 'center', paddingHorizontal: 12 },
    countPrompt: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.muted, marginBottom: 10, textAlign: 'center' },

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

    // .urgency-badge -- ok / warn / urgent
    varianceBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radii.full },
    variance_ok: { backgroundColor: `rgba(${colors.limeRgb},0.18)` },
    variance_warn: { backgroundColor: 'rgba(224,184,74,0.20)' },
    variance_urgent: { backgroundColor: 'rgba(224,138,106,0.20)' },
    varianceText: { fontFamily: fonts.monoBold, fontSize: 12.5 },
    varianceText_ok: { color: colors.accentText },
    varianceText_warn: { color: colors.amber },
    varianceText_urgent: { color: colors.danger },

    error: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.danger, marginTop: 10, textAlign: 'center' },

    submit: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    submitSpaced: { marginTop: 16 },
    submitDisabled: { backgroundColor: colors.surf2 },
    submitText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
    submitTextDisabled: { color: colors.muted },
  }),
);
