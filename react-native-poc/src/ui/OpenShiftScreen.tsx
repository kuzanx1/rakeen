import React, { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity } from './tappable';
import KeyboardLift from './KeyboardLift';
import GradientFill from './GradientFill';
import { openShift } from '../application/shiftService';
import type { Shift } from '../domain/shift';
import { createStyles, fonts, gradients, useTheme } from './theme';
import { authBaseStyles } from './authLook';
import { toLatinDigits } from '../domain/digits';

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
  staffMemberId,
  onOpened,
}: {
  businessId: number;
  branchId: number;
  cashierId: string;
  /** shifts.staff_member_id -- who was on duty when it opened. */
  staffMemberId: number | null;
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
      const result = await openShift({ businessId, branchId, cashierId, staffMemberId, openingCash });
      if (result.shift) onOpened(result.shift);
      else setError(result.error ?? 'تعذر بدء الوردية.');
    } finally {
      setBusy(false);
    }
  };

  return (
    // KeyboardLift like LoginScreen: automaticallyAdjustKeyboardInsets is
    // iOS-only, so on Android the float field and «ابدأ الوردية» sat under
    // the keyboard.
    <KeyboardLift style={styles.screen}>
      <ScrollView contentContainerStyle={styles.centerBox} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
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
            <Text style={styles.label}>الرصيد الافتتاحي (ر.س)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              value={cash}
              onChangeText={t => setCash(toLatinDigits(t))}
              autoFocus
            />
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity onPress={submit} disabled={busy} activeOpacity={0.85} style={styles.submitWrap}>
            <View style={[styles.submit, busy && styles.submitBusy]}>
              {!busy && <GradientFill gradient={gradients.payButton} radius={17} />}
              {busy ? (
                <ActivityIndicator color={colors.muted} />
              ) : (
                <Text style={styles.submitText}>بدء الوردية</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardLift>
  );
}

const useStyles = createStyles((colors, shadows) =>
  StyleSheet.create({
    ...authBaseStyles(colors, shadows),
    label: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text, marginBottom: 8, alignSelf: 'stretch' },
    // المبلغ كبير بخط الأرقام، مثل #posOpenShiftScreen في الويب
    input: {
      width: '100%',
      height: 72,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surf1,
      color: colors.text,
      fontFamily: fonts.monoBold,
      fontSize: 30,
      textAlign: 'center',
      paddingHorizontal: 18,
    },
  }),
);
