import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import GradientFill from './GradientFill';
import { listBranchStaff, readCachedBranchStaff, rememberStaff } from '../application/staffService';
import type { StaffMember } from '../application/staffService';
import { createStyles, fonts, gradients, useTheme } from './theme';
import { authBaseStyles } from './authLook';
import AuthLangButton from './AuthLangButton';

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
    // الأسماء المحفوظة تظهر فوراً، والخادم يصحّحها حين يردّ: القائمة
    // تتغيّر مرّة في الشهر، ولا معنى لدوّارة تحميل أمامها كل صباح.
    let fresh = false;
    readCachedBranchStaff(branchId).then(cached => {
      if (!cancelled && !fresh && cached && cached.length > 0) setStaff(cached);
    });
    (async () => {
      const rows = await listBranchStaff(branchId);
      fresh = true;
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
          <AuthLangButton />
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
                  <GradientFill gradient={gradients.payButton} radius={17} />
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
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{member.name.trim().charAt(0)}</Text>
                  </View>
                  <Text style={styles.staffBtnText} numberOfLines={1}>{member.name}</Text>
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
    ...authBaseStyles(colors, shadows),
    loading: { marginVertical: 20 },
    preparing: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
    preparingText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.muted },
    // .pos-staff-list
    list: { width: '100%', gap: 11 },
    // .pos-staff-btn v2: حرف الاسم في دائرة، والاسم بجانبه
    staffBtn: {
      width: '100%',
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 18,
      backgroundColor: colors.surf1,
      borderWidth: 1.5,
      borderColor: colors.line,
    },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.graphite ?? '#111', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.lime },
    staffBtnText: { flex: 1, fontFamily: fonts.sansBold, fontSize: 16.5, color: colors.text, textAlign: 'left' },
  }),
);
