import React, { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { openShift } from '../application/shiftService';
import type { Shift } from '../domain/shift';
import { createStyles, fonts, gradients, radii, useTheme } from './theme';

/**
 * #posOpenShiftScreen (pos-markup.ts) -- the step between signing in and
 * the till opening.
 *
 * afterStaffReady() (rakeen-pos.js:6277) looks for an open shift; if there
 * is none it shows this instead of the app. So a cashier cannot reach the
 * products grid without first declaring what is in the drawer -- which is
 * the entire basis for the closing count later. This app skipped the step
 * altogether and went straight to selling.
 *
 * Visually it is the same .pos-auth-card as the login screens: the
 * wordmark, "بدء الوردية", the explanatory sub-line, one labelled numeric
 * field, and the gradient submit.
 */
export default function OpenShiftScreen({
  businessId,
  branchId,
  cashierId,
  onOpened,
}: {
  businessId: number;
  branchId: number;
  cashierId: string;
  onOpened: (shift: Shift) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [cash, setCash] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const openingCash = parseFloat(cash);
    setError('');
    // `if(!(openingCash >= 0))` -- written this way on purpose, so NaN
    // from an empty or non-numeric field fails too rather than slipping
    // through a `< 0` test.
    if (!(openingCash >= 0)) {
      setError('اكتب رصيد افتتاحي صحيح.');
      return;
    }
    setBusy(true);
    try {
      const result = await openShift({ businessId, branchId, cashierId, openingCash });
      if (result.shift) onOpened(result.shift);
      else setError(result.error ?? 'تعذر بدء الوردية.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.centerBox} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Image
            source={require('../../assets/brand/rakeen-wordmark.png')}
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="ركين"
          />
          <Text style={styles.title}>بدء الوردية</Text>
          <Text style={styles.sub}>أدخل المبلغ النقدي الموجود بالدرج عشان تبدأ الوردية</Text>

          <View style={styles.field}>
            <Text style={styles.label}>الرصيد الافتتاحي</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              value={cash}
              onChangeText={setCash}
              autoFocus
            />
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity onPress={submit} disabled={busy} activeOpacity={0.85}>
            <View style={[styles.submit, busy && styles.submitBusy]}>
              {!busy && <GradientFill gradient={gradients.payButton} radius={radii.md} />}
              {busy ? (
                <ActivityIndicator color={colors.muted} />
              ) : (
                <Text style={styles.submitText}>بدء الوردية</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = createStyles((colors, shadows) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    centerBox: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    // .pos-auth-card
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.cardBg,
      borderRadius: 28,
      paddingTop: 36,
      paddingHorizontal: 30,
      paddingBottom: 30,
      alignItems: 'center',
      ...shadows.md,
    },
    wordmark: { height: 28, width: 65, marginBottom: 14 },
    // .pos-auth-title
    title: { fontFamily: fonts.sansBold, fontSize: 21, color: colors.text, marginBottom: 6 },
    // .pos-auth-sub
    sub: {
      fontFamily: fonts.sansMedium,
      fontSize: 12.5,
      lineHeight: 20.625,
      color: colors.muted,
      textAlign: 'center',
      marginBottom: 18,
    },
    field: { width: '100%', marginBottom: 12 },
    label: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.muted, marginBottom: 6 },
    input: {
      width: '100%',
      backgroundColor: colors.surf1,
      borderRadius: 16,
      paddingVertical: 13,
      paddingHorizontal: 15,
      color: colors.text,
      fontFamily: fonts.monoBold,
      fontSize: 15,
      textAlign: 'center',
    },
    // .pos-auth-error
    error: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.danger, marginBottom: 10, textAlign: 'center' },
    submit: {
      width: '100%',
      paddingVertical: 16,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    submitBusy: { backgroundColor: colors.surf2 },
    submitText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
  }),
);
