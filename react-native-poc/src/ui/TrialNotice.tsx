import React, { useEffect, useState } from 'react';
import { Linking, Modal, View } from 'react-native';
import { Text } from './Text';
import { TouchableOpacity } from './tappable';
import { createStyles, fonts, radii, spacing } from './theme';
import { TrialStatus, TRIAL_SUBSCRIBE_WA, trialNotice } from '../domain/trial';
import { getTrialClockOffset, getTrialStatus, refreshTrialStatus, subscribeTrial } from '../application/trialService';

/** يتابع حالة التجربة: قراءة أول ما تنفتح الشاشة ثم كل 5 دقايق. */
export function useTrialStatus(): TrialStatus | null {
  const [status, setStatus] = useState<TrialStatus | null>(getTrialStatus());
  const [, setTick] = useState(0);
  useEffect(() => {
    const off = subscribeTrial(setStatus);
    refreshTrialStatus();
    const poll = setInterval(refreshTrialStatus, 5 * 60 * 1000);
    // عدّاد ساعات المهلة يتحدّث بدون ما ننادي الخادم
    const tick = setInterval(() => setTick(n => n + 1), 60 * 1000);
    return () => {
      off();
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);
  return status;
}

/** الشريط فوق الكاشير: كم باقي، ثم كم ساعة على القفل. */
export function TrialBanner({ status }: { status: TrialStatus | null }) {
  const styles = useStyles();
  const notice = trialNotice(status, Date.now(), getTrialClockOffset());
  if (!notice) return null;
  return (
    <View style={[styles.banner, notice.danger ? styles.bannerDanger : styles.bannerInfo]}>
      <Text style={styles.bannerText}>{notice.text}</Text>
    </View>
  );
}

/** يطلع لما الكاشير يحاول يبدأ طلب جديد بعد القفل. */
export function TrialEndedModal({ visible, limit, onClose }: { visible: boolean; limit: number; onClose: () => void }) {
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>انتهت الفترة التجريبية</Text>
          <Text style={styles.body}>
            استخدمت {limit} طلب مجاني. اشترك الحين عشان تكمل البيع من الكاشير والمتجر. بياناتك وتقاريرك محفوظة كلها.
          </Text>
          <TouchableOpacity style={styles.primary} onPress={() => Linking.openURL(TRIAL_SUBSCRIBE_WA)}>
            <Text style={styles.primaryText}>اشترك الحين</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onClose}>
            <Text style={styles.secondaryText}>إغلاق</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createStyles(colors => ({
  banner: {
    marginHorizontal: spacing[3],
    marginTop: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radii.sm,
  },
  bannerDanger: { backgroundColor: `rgba(${colors.dangerRgb},0.14)` },
  bannerInfo: { backgroundColor: `rgba(${colors.limeDeepRgb},0.16)` },
  bannerText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text, textAlign: 'center' as const },
  overlay: {
    flex: 1,
    backgroundColor: colors.modalOverlay,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: spacing[4],
  },
  card: {
    width: '100%' as const,
    maxWidth: 380,
    backgroundColor: colors.cardBg,
    borderRadius: radii.lg,
    padding: spacing[6],
  },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.text, textAlign: 'center' as const, marginBottom: spacing[2] },
  body: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 24, color: colors.text, textAlign: 'center' as const, marginBottom: spacing[5] },
  primary: { backgroundColor: colors.limeDeep, borderRadius: radii.md, paddingVertical: spacing[3], alignItems: 'center' as const },
  primaryText: { fontFamily: fonts.sansBold, fontSize: 15, color: '#12261A' },
  secondary: { paddingVertical: spacing[3], alignItems: 'center' as const },
  secondaryText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted },
}));
