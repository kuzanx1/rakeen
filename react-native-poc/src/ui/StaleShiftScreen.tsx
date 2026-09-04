import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { createStyles, fonts, gradients, radii } from './theme';
import { formatArabicDateTimeWithWeekday } from '../domain/arabicDate';

/**
 * Shown when the open shift belongs to a trading day that has already
 * ended.
 *
 * Nothing closes a shift on its own: a cashier who locks up without
 * running the closing wizard leaves it open indefinitely. Then the next
 * day's sales land inside yesterday's shift, its Z-report covers several
 * days at once, and its cash is counted against a float declared two days
 * ago. Logging in never asks for a new shift, because an open one is
 * found -- which is exactly how a shift quietly runs for days.
 *
 * So this stands in front of the till rather than warning and letting the
 * cashier past. Reconciling yesterday's drawer before today's first sale
 * is the only way the count means anything, and the only way each trading
 * day gets its own report.
 */
export default function StaleShiftScreen({
  openedAt,
  onClose,
}: {
  openedAt: string;
  onClose: () => void;
}) {
  const styles = useStyles();
  const label = formatArabicDateTimeWithWeekday(new Date(openedAt));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.centerBox}>
        <View style={styles.card}>
          <Image
            source={require('../../assets/brand/rakeen-wordmark.png')}
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="ركين"
          />
          <Text style={styles.title}>فيه وردية ما انقفلت</Text>
          <Text style={styles.sub}>
            الوردية مفتوحة من {label}، والفرع سكّر بعدها. لازم تقفلها وتعدّ الدرج قبل ما تبدأ بيع
            اليوم — عشان مبيعات اليوم ما تدخل بوردية أمس.
          </Text>

          <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={styles.submitWrap}>
            <View style={styles.submit}>
              <GradientFill gradient={gradients.payButton} radius={radii.md} />
              <Text style={styles.submitText}>إغلاق الوردية السابقة</Text>
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
    title: { fontFamily: fonts.sansBold, fontSize: 21, color: colors.text, marginBottom: 6 },
    sub: {
      fontFamily: fonts.sansMedium,
      fontSize: 12.5,
      lineHeight: 20.625,
      color: colors.muted,
      textAlign: 'center',
      marginBottom: 18,
    },
    submitWrap: { width: '100%' },
    submit: {
      width: '100%',
      paddingVertical: 16,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    submitText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.flagGreenDeep },
  }),
);
