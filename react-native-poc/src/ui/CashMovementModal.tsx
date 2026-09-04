import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { recordCashMovement } from '../application/shiftService';
import type { Shift } from '../domain/shift';
import { createStyles, fonts, gradients, radii, useTheme } from './theme';

/**
 * Recording cash that enters or leaves the drawer without being a sale:
 * a supplier paid from the till, float fetched from the safe, a cash drop
 * to the office.
 *
 * These happen in every real shop, and with nowhere to record them each
 * one surfaced at closing as an unexplained variance. That is the most
 * common reason a drawer "doesn't balance" once the arithmetic is right --
 * and it teaches everyone to shrug at variances, which defeats the point
 * of counting at all.
 *
 * The reason field is required. An unexplained movement is just a variance
 * that has been given somewhere to hide.
 */
export default function CashMovementModal({
  visible,
  shift,
  staffMemberId,
  onClose,
  onRecorded,
}: {
  visible: boolean;
  shift: Shift | null;
  staffMemberId: number | null;
  onClose: () => void;
  onRecorded: (message: string) => void;
}) {
  const { colors, shadows } = useTheme();
  const styles = useStyles();
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    // 'out' first: paying a supplier from the till is far and away the
    // commonest of the two.
    setDirection('out');
    setAmount('');
    setReason('');
    setBusy(false);
    setError('');
  }, [visible]);

  const value = parseFloat(amount) || 0;
  const canSave = value > 0 && reason.trim().length > 0;

  const save = async () => {
    if (!shift || !canSave) return;
    setBusy(true);
    setError('');
    const result = await recordCashMovement({
      shift,
      direction,
      amount: value,
      reason,
      staffMemberId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'تعذر تسجيل الحركة.');
      return;
    }
    onRecorded(direction === 'out' ? 'تم تسجيل سحب من الدرج' : 'تم تسجيل إيداع بالدرج');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, shadows.md]}>
          <View style={styles.head}>
            <Text style={styles.title}>حركة نقدية بالدرج</Text>
            <TouchableOpacity onPress={onClose} style={styles.headCircle}>
              <Text style={styles.closeGlyph}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {!shift ? (
              <Text style={styles.sub}>ما فيه وردية مفتوحة.</Text>
            ) : (
              <>
                <View style={styles.tabs}>
                  <TouchableOpacity
                    style={[styles.tab, direction === 'out' && styles.tabActive]}
                    onPress={() => setDirection('out')}
                    activeOpacity={0.8}>
                    <Text style={[styles.tabText, direction === 'out' && styles.tabTextActive]}>
                      سحب من الدرج
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tab, direction === 'in' && styles.tabActive]}
                    onPress={() => setDirection('in')}
                    activeOpacity={0.8}>
                    <Text style={[styles.tabText, direction === 'in' && styles.tabTextActive]}>
                      إيداع بالدرج
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>المبلغ</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                  autoFocus
                />

                <Text style={styles.label}>السبب</Text>
                <TextInput
                  style={[styles.input, styles.reasonInput]}
                  placeholder={direction === 'out' ? 'مثال: دفعة لمورّد الخضار' : 'مثال: فكّة من الخزنة'}
                  placeholderTextColor={colors.muted}
                  value={reason}
                  onChangeText={setReason}
                />

                {!!error && <Text style={styles.error}>{error}</Text>}

                {busy ? (
                  <View style={[styles.submit, styles.submitDisabled]}>
                    <ActivityIndicator color={colors.muted} />
                  </View>
                ) : canSave ? (
                  <TouchableOpacity onPress={save} activeOpacity={0.85}>
                    <View style={styles.submit}>
                      <GradientFill gradient={gradients.payButton} radius={radii.md} />
                      <Text style={styles.submitText}>تسجيل الحركة</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.submit, styles.submitDisabled]}>
                    <Text style={[styles.submitText, styles.submitTextDisabled]}>تسجيل الحركة</Text>
                  </View>
                )}

                <Text style={styles.note}>
                  الحركة تُسجَّل ولا تُعدَّل — لو صار غلط، سجّل حركة عكسها.
                </Text>
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
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingHorizontal: 22 },
    title: { fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text },
    headCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' },
    closeGlyph: { color: colors.text, fontSize: 13 },
    body: { paddingTop: 18, paddingHorizontal: 22, paddingBottom: 22 },
    sub: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.muted, textAlign: 'center', paddingVertical: 20 },

    tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    tab: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      alignItems: 'center',
    },
    tabActive: { borderColor: colors.limeDeep, backgroundColor: `rgba(${colors.limeRgb},0.12)` },
    tabText: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.muted },
    tabTextActive: { color: colors.accentText },

    label: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, marginBottom: 6 },
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
      marginBottom: 14,
    },
    reasonInput: { fontFamily: fonts.sansSemiBold, fontSize: 13, textAlign: 'right' },
    error: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.danger, textAlign: 'center', marginBottom: 10 },
    submit: { width: '100%', paddingVertical: 16, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    submitDisabled: { backgroundColor: colors.surf2 },
    submitText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
    submitTextDisabled: { color: colors.muted },
    note: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 12 },
  }),
);
