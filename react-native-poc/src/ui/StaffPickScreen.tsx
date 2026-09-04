import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { listBranchStaff, rememberStaff } from '../application/staffService';
import type { StaffMember } from '../application/staffService';
import { createStyles, fonts, gradients, radii, useTheme } from './theme';

/**
 * #posStaffPickScreen -- "مين اللي مداوم؟" (rakeen-pos.js:6206).
 *
 * Sits between the branch PIN and the till, and this app skipped it
 * entirely. That is why every order was filed with `staff_member_id: null`:
 * the branch PIN is a shared account, so this screen is the ONLY place the
 * app learns which human is on the till.
 *
 * The empty state is not a dead end. When a branch has no staff yet the
 * source points at where to add them and offers to carry on unnamed, so a
 * business that has not filled that in can still sell.
 */
export default function StaffPickScreen({
  branchId,
  onPicked,
}: {
  branchId: number;
  onPicked: (member: StaffMember | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listBranchStaff(branchId);
      if (!cancelled) setStaff(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const pick = async (member: StaffMember | null) => {
    // goToStaffReady() (:6238) swaps the list for a spinner, because
    // picking a name used to sit there with no feedback while the shift
    // lookup and the whole catalog load ran -- the reported "feels stuck".
    setPreparing(true);
    await rememberStaff(member);
    onPicked(member);
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
          <Text style={styles.title}>مين اللي مداوم؟</Text>
          <Text style={styles.sub}>اختر اسمك عشان تتسجل الطلبات باسمك</Text>

          {preparing ? (
            <View style={styles.preparing}>
              <ActivityIndicator color={colors.accentText} />
              <Text style={styles.preparingText}>جارٍ تجهيز الكاشير...</Text>
            </View>
          ) : staff == null ? (
            <ActivityIndicator color={colors.accentText} style={styles.loading} />
          ) : staff.length === 0 ? (
            <>
              <Text style={styles.sub}>
                ما فيه موظفين مضافين لهذا الفرع بعد — أضفهم من الإعدادات بالداشبورد.
              </Text>
              <TouchableOpacity onPress={() => pick(null)} activeOpacity={0.85} style={styles.submitWrap}>
                <View style={styles.submit}>
                  <GradientFill gradient={gradients.payButton} radius={radii.md} />
                  <Text style={styles.submitText}>متابعة بدون اسم</Text>
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.list}>
              {staff.map(member => (
                // .pos-staff-btn
                <TouchableOpacity
                  key={member.id}
                  style={styles.staffBtn}
                  onPress={() => pick(member)}
                  activeOpacity={0.8}>
                  <Text style={styles.staffBtnText}>{member.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
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
    loading: { marginVertical: 20 },
    preparing: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
    preparingText: { fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.muted },
    // .pos-staff-list
    list: { width: '100%', gap: 8 },
    // .pos-staff-btn
    staffBtn: {
      width: '100%',
      paddingVertical: 15,
      paddingHorizontal: 16,
      borderRadius: radii.md,
      backgroundColor: colors.surf1,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
    },
    staffBtnText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.text },
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
