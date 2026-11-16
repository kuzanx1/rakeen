import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { TouchableOpacity } from './tappable';
import AuthScroll, { useKeyboardOpen } from './AuthScroll';
import GradientFill from './GradientFill';
import { openShift } from '../application/shiftService';
import type { Shift } from '../domain/shift';
import { createStyles, fonts, gradients, useTheme } from './theme';
import { authBaseStyles } from './authLook';
import AuthLangButton from './AuthLangButton';
import { toLatinDigits } from '../domain/digits';
import { isNumbersOn } from '../application/orderNumberPool';
import { getItem, setItem } from '../infrastructure/mmkvStorage';

/** آخر «أول رقم» اختاره المحل: يتذكّره الجهاز للوردية الجاية. */
const START_KEY = 'rk_order_no_start';

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
  const kb = useKeyboardOpen();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // أرقام الطلبات تبدأ من… (بس للمحل اللي مفعّل له رقم خاص).
  const [numbersOn, setNumbersOnState] = useState(false);
  const [start, setStart] = useState('1');
  const [editStart, setEditStart] = useState(false);
  useEffect(() => {
    let alive = true;
    isNumbersOn().then(v => alive && setNumbersOnState(v)).catch(() => {});
    getItem(START_KEY)
      .then(v => {
        const n = Number(v);
        if (alive && n >= 1 && n <= 9999) setStart(String(n));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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
    let orderNoStart: number | null = null;
    if (numbersOn) {
      const n = Number(start || '1');
      if (!(Number.isInteger(n) && n >= 1 && n <= 9999)) {
        setError('رقم أول فاتورة: من ١ إلى ٩٩٩٩');
        setEditStart(true);
        return;
      }
      orderNoStart = n;
      setItem(START_KEY, String(n)).catch(() => {});
    }
    setBusy(true);
    try {
      const result = await openShift({ businessId, branchId, cashierId, staffMemberId, openingCash, orderNoStart });
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
    <AuthScroll style={styles.screen} contentContainerStyle={[styles.centerBox, kb && styles.centerBoxKb]}>
        <View style={[styles.card, kb && styles.cardKb]}>
          <AuthLangButton />
          {!kb && (
            <Image
              source={require('../../assets/brand/rakeen-wordmark.png')}
              style={styles.wordmark}
              resizeMode="contain"
              accessibilityLabel="ركين"
            />
          )}
          <Text style={[styles.title, kb && styles.titleKb]}>بدء الوردية</Text>
          {!kb && <Text style={styles.sub}>أدخل المبلغ النقدي الموجود بالدرج عشان تبدأ الوردية</Text>}

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

          {numbersOn &&
            (editStart ? (
              <View style={styles.field}>
                <Text style={styles.label}>أول فاتورة اليوم تبدأ من رقم</Text>
                <TextInput
                  style={[styles.input, styles.startInput]}
                  placeholder="1"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={start}
                  onChangeText={t => setStart(toLatinDigits(t).replace(/[^0-9]/g, '').slice(0, 4))}
                />
                <Text style={styles.startHint}>الفواتير ترجع ١ كل يوم. لو اليوم وصلت لرقم أكبر، تكمّل منه</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setEditStart(true)}
                activeOpacity={0.7}
                style={styles.startRow}
                accessibilityRole="button"
                accessibilityLabel="غيّر رقم أول فاتورة"
              >
                <Text style={styles.startRowText}>
                  {'فواتير اليوم تبدأ من '}
                  <Text style={styles.startRowNo}>{`#${Number(start) || 1}`}</Text>
                </Text>
                <Text style={styles.startRowLink}>غيّر</Text>
              </TouchableOpacity>
            ))}

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
    </AuthScroll>
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
    startInput: { height: 56, fontSize: 24 },
    startHint: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.muted, marginTop: 6, textAlign: 'center', alignSelf: 'stretch' },
    startRow: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: colors.surf1,
      marginBottom: 12,
    },
    startRowText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted },
    startRowNo: { fontFamily: fonts.monoBold, color: colors.text },
    startRowLink: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.accentText },
  }),
);
